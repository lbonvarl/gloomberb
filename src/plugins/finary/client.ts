import { isIsin } from "../../utils/format";
import type { BrokerAccount } from "../../types/trading";
import type { BrokerPosition } from "../../types/broker";
import type { BrokerInstanceConfig } from "../../types/config";
import type { DataProvider } from "../../types/data-provider";
import type { InstrumentSearchResult } from "../../types/instrument";
import { loadFintermFinaryPortfolio, type FintermFinaryAccount, type FintermFinaryHolding, type FintermFinaryPortfolio } from "./auth";
import { debugLog } from "../../utils/debug-log";

const finaryLog = debugLog.createLogger("finary-api");

const SNAPSHOT_TTL_MS = 5_000;

interface CachedSnapshot {
  loadedAt: number;
  portfolio: FintermFinaryPortfolio;
}

interface ResolvedFinaryInstrument {
  ticker: string;
  exchange: string;
}

interface ResolutionCandidate {
  result: InstrumentSearchResult;
  score: number;
}

const KNOWN_FINARY_ISIN_OVERRIDES: Record<string, ResolvedFinaryInstrument> = {
  GB00B00FHZ82: { ticker: "OGG9.L", exchange: "LONDON" },
  LU0496786574: { ticker: "LYPS.DE", exchange: "XETRA" },
  LU1557118921: { ticker: "0P00019VOY.F", exchange: "FRANKFURT" },
};

const KNOWN_FINARY_NAME_OVERRIDES: Record<string, ResolvedFinaryInstrument> = {
  "FID GR CO POOL CL D": { ticker: "FDGRX", exchange: "" },
  "SP EXT MKT IDX CL D": { ticker: "FSMAX", exchange: "" },
  "SP GLB EXUS IDX CL D": { ticker: "FSGGX", exchange: "" },
  "SP 500 INDEX PL CL D": { ticker: "FXAIX", exchange: "" },
};

const snapshotCache: Map<string, CachedSnapshot> = (globalThis as any).__finarySnapshotCache ??= new Map();

function mapAccount(account: FintermFinaryAccount): BrokerAccount {
  const name = account.name.trim();
  const isCashAccount = ["bank_account", "savings", "employee_savings"].includes(account.account_type);

  return {
    accountId: account.id,
    name: name,
    currency: account.currency || "EUR",
    source: account.sync_source,
    updatedAt: account.last_sync_at ? Date.parse(account.last_sync_at) : undefined,
    netLiquidation: account.balance,
    totalCashValue: isCashAccount ? account.balance : undefined,
    ownership: account.ownership,
  };
}

function isValidTicker(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return (
    s.length > 0 &&
    !s.includes(" ") &&
    !s.startsWith("FY-") &&
    !s.startsWith("XX-") &&
    !s.includes("LIQUIDITY") &&
    // Filter out purely numeric or ID-like symbols if they don't look like standard tickers
    // Finary IDs often look like FY0000094129 or just numeric IDs
    !/^FY\d+$/.test(s)
  );
}

function resolveTicker(holding: FintermFinaryHolding): string | null {
  const symbol = holding.symbol?.trim();
  if (symbol && isValidTicker(symbol)) {
    return symbol.replace(/\s+/g, "-").toUpperCase();
  }
  const isin = holding.isin?.trim();
  if (isin && isValidTicker(isin)) {
    return isin.toUpperCase();
  }
  const nameOverride = KNOWN_FINARY_NAME_OVERRIDES[holding.name?.trim().toUpperCase() ?? ""];
  if (nameOverride) {
    return nameOverride.ticker;
  }
  return null;
}

function isLikelyTickerExtension(baseTicker: string, candidateSymbol?: string | null): boolean {
  const normalizedCandidate = candidateSymbol?.trim().toUpperCase();
  if (!normalizedCandidate) return false;
  if (normalizedCandidate === baseTicker) return true;
  return normalizedCandidate.startsWith(`${baseTicker}.`) || normalizedCandidate.startsWith(`${baseTicker}-`);
}

function normalizeNameForMatch(value?: string | null): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function tokenizeName(value?: string | null): string[] {
  return normalizeNameForMatch(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function hasStrongNameMatch(holdingName?: string | null, candidateName?: string | null): boolean {
  const holdingTokens = tokenizeName(holdingName);
  const candidateTokens = tokenizeName(candidateName);
  if (holdingTokens.length === 0 || candidateTokens.length === 0) return false;

  const candidateSet = new Set(candidateTokens);
  const overlap = holdingTokens.filter((token) => candidateSet.has(token));
  return overlap.length >= Math.min(3, holdingTokens.length);
}

function getNameOverlapScore(holdingName?: string | null, candidateName?: string | null): number {
  const holdingTokens = tokenizeName(holdingName);
  const candidateTokens = tokenizeName(candidateName);
  if (holdingTokens.length === 0 || candidateTokens.length === 0) return 0;

  const candidateSet = new Set(candidateTokens);
  return holdingTokens.filter((token) => candidateSet.has(token)).length;
}

function normalizeCandidateIsin(result: InstrumentSearchResult): string {
  const raw = typeof (result as { isin?: unknown }).isin === "string"
    ? (result as { isin?: string }).isin
    : "";
  return raw?.trim().toUpperCase() ?? "";
}

function getTypeScore(type?: string): number {
  const normalized = type?.trim().toUpperCase() ?? "";
  if (normalized.includes("ETF")) return 160;
  if (normalized.includes("EQUITY") || normalized.includes("STOCK")) return 120;
  if (normalized.includes("FUND") || normalized.includes("MUTUAL")) return 20;
  return 60;
}

function getExchangeScore(exchange?: string): number {
  const normalized = exchange?.trim().toUpperCase() ?? "";
  if (["PARIS", "XETRA", "LONDON", "AMSTERDAM", "MILAN", "FRANKFURT", "TORONTO"].includes(normalized)) return 40;
  if (normalized === "STUTTGART") return -40;
  return 0;
}

function buildResolutionCandidate(
  holding: FintermFinaryHolding,
  baseTicker: string,
  normalizedIsin: string | undefined,
  result: InstrumentSearchResult,
  source: "isin" | "name",
  isSingleIsinResult: boolean,
): ResolutionCandidate | null {
  const symbol = result.symbol?.trim().toUpperCase();
  if (!symbol) return null;

  let score = source === "isin" ? 100 : 0;
  const candidateIsin = normalizeCandidateIsin(result);
  if (normalizedIsin && candidateIsin === normalizedIsin) score += 1000;
  if (isLikelyTickerExtension(baseTicker, symbol)) score += 700;

  const overlapScore = getNameOverlapScore(holding.name, result.name);
  const strongNameMatch = hasStrongNameMatch(holding.name, result.name);
  score += overlapScore * 80;
  if (strongNameMatch) score += 220;

  if (!candidateIsin && !isLikelyTickerExtension(baseTicker, symbol) && !strongNameMatch) {
    score -= 260;
  }

  if (source === "isin" && isSingleIsinResult && (strongNameMatch || isLikelyTickerExtension(baseTicker, symbol))) {
    score += result.type?.toUpperCase().includes("MUTUAL") ? 60 : 220;
  }

  score += getTypeScore(result.type);
  score += getExchangeScore(result.exchange);

  if (symbol === `${normalizedIsin}.SG`) score -= 250;
  if (symbol.endsWith(".SG") && !isLikelyTickerExtension(baseTicker, symbol)) score -= 120;

  return { result, score };
}

function chooseBestCandidate(candidates: ResolutionCandidate[]): InstrumentSearchResult | null {
  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  const best = sorted[0];
  return best && best.score >= 240 ? best.result : null;
}

async function resolveFullTicker(holding: FintermFinaryHolding, dataProvider?: DataProvider): Promise<ResolvedFinaryInstrument | null> {
  const baseTicker = resolveTicker(holding);
  if (!baseTicker) return null;
  const normalizedIsin = holding.isin?.trim().toUpperCase();
  const nameOverride = KNOWN_FINARY_NAME_OVERRIDES[holding.name?.trim().toUpperCase() ?? ""];
  const knownIsinOverride = normalizedIsin ? KNOWN_FINARY_ISIN_OVERRIDES[normalizedIsin] : undefined;

  if (knownIsinOverride) {
    finaryLog.info(`Resolved Finary ISIN ${normalizedIsin} (${baseTicker}) via known override to full ticker ${knownIsinOverride.ticker}`);
    return knownIsinOverride;
  }

  if (nameOverride) {
    finaryLog.info(`Resolved Finary holding ${holding.name} via known name override to full ticker ${nameOverride.ticker}`);
    return nameOverride;
  }

  // If we have an ISIN and the ticker looks like a short/generic symbol (no dots),
  // try to resolve the full Yahoo-style ticker via search.
  if (normalizedIsin && (!baseTicker.includes(".") || isIsin(baseTicker)) && dataProvider) {
    try {
      const isinResults = await dataProvider.search(normalizedIsin);
      const nameResults = holding.name?.trim()
        ? await dataProvider.search(holding.name.trim())
        : [];
      const candidates = new Map<string, ResolutionCandidate>();

      for (const result of isinResults) {
        const candidate = buildResolutionCandidate(holding, baseTicker, normalizedIsin, result, "isin", isinResults.length === 1);
        if (!candidate) continue;
        const key = `${candidate.result.symbol.toUpperCase()}|${candidate.result.exchange.toUpperCase()}`;
        const existing = candidates.get(key);
        if (!existing || existing.score < candidate.score) candidates.set(key, candidate);
      }
      for (const result of nameResults) {
        const candidate = buildResolutionCandidate(holding, baseTicker, normalizedIsin, result, "name", false);
        if (!candidate) continue;
        const key = `${candidate.result.symbol.toUpperCase()}|${candidate.result.exchange.toUpperCase()}`;
        const existing = candidates.get(key);
        if (!existing || existing.score < candidate.score) candidates.set(key, candidate);
      }

      const selected = chooseBestCandidate([...candidates.values()]);

      if (selected) {
        finaryLog.info(`Resolved Finary ISIN ${normalizedIsin} (${baseTicker}) to full ticker ${selected.symbol}`);
        return {
          ticker: selected.symbol.toUpperCase(),
          exchange: selected.exchange?.trim().toUpperCase() || "",
        };
      }
    } catch (err) {
      finaryLog.error(`Failed to resolve ISIN ${normalizedIsin} for Finary import: ${err}`);
    }
  }

  return {
    ticker: baseTicker,
    exchange: "FINARY",
  };
}

function mapPosition(
  account: FintermFinaryAccount,
  holding: FintermFinaryHolding,
  resolvedInstrument: ResolvedFinaryInstrument,
): BrokerPosition | null {
  let assetCategory = "OTHER";
  const rawType = holding.asset_type.toLowerCase();
  if (rawType.includes("stock") || rawType.includes("etf")) assetCategory = "STK";
  else if (rawType.includes("crypto")) assetCategory = "CRYPTO";
  else if (rawType.includes("fund")) assetCategory = "FUND";

  return {
    ticker: resolvedInstrument.ticker,
    exchange: resolvedInstrument.exchange,
    shares: holding.quantity ?? 0,
    avgCost: holding.buying_price ?? 0,
    currency: holding.currency ?? account.currency ?? "EUR",
    accountId: account.id,
    name: holding.name,
    assetCategory,
    isin: holding.isin ?? undefined,
    markPrice: holding.current_price ?? undefined,
    marketValue: holding.current_value ?? undefined,
    unrealizedPnl: holding.unrealized_pnl ?? undefined,
    side: "long",
  };
}

export class FinaryClient {
  constructor(private readonly instance: BrokerInstanceConfig) {
  }

  private async loadSnapshot(): Promise<FintermFinaryPortfolio> {
    const cached = snapshotCache.get(this.instance.id);
    if (cached && Date.now() - cached.loadedAt < SNAPSHOT_TTL_MS) {
      return cached.portfolio;
    }
    const portfolio = await loadFintermFinaryPortfolio(this.instance);
    snapshotCache.set(this.instance.id, { loadedAt: Date.now(), portfolio });
    return portfolio;
  }

  async listAccounts(): Promise<BrokerAccount[]> {
    const snapshot = await this.loadSnapshot();
    const validAccounts = snapshot.accounts.filter((account) => (
      account.holdings.some((holding) => resolveTicker(holding) !== null)
    ));
    finaryLog.info("Loaded Finary accounts", {
      totalCount: snapshot.accounts.length,
      validCount: validAccounts.length,
    });
    return validAccounts.map(mapAccount);
  }

  async importPositions(dataProvider?: DataProvider): Promise<BrokerPosition[]> {
    const snapshot = await this.loadSnapshot();
    const validAccounts = snapshot.accounts.filter((account) => (
      account.holdings.some((holding) => resolveTicker(holding) !== null)
    ));
    
    const positions: BrokerPosition[] = [];
    for (const account of validAccounts) {
      for (const holding of account.holdings) {
        const instrument = await resolveFullTicker(holding, dataProvider);
        if (!instrument) continue;

        const position = mapPosition(account, holding, instrument);
        if (position) {
          positions.push(position);
        }
      }
    }

    finaryLog.info("Imported Finary positions", {
      totalAccountCount: snapshot.accounts.length,
      validAccountCount: validAccounts.length,
      positionCount: positions.length,
    });
    return positions;
  }
}
