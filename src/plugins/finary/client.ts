import type { BrokerAccount } from "../../types/trading";
import type { BrokerPosition } from "../../types/broker";
import type { BrokerInstanceConfig } from "../../types/config";
import { loadFintermFinaryPortfolio, type FintermFinaryAccount, type FintermFinaryHolding, type FintermFinaryPortfolio } from "./auth";
import { debugLog } from "../../utils/debug-log";

const finaryLog = debugLog.createLogger("finary-api");

const SNAPSHOT_TTL_MS = 5_000;

interface CachedSnapshot {
  loadedAt: number;
  portfolio: FintermFinaryPortfolio;
}

const snapshotCache: Map<string, CachedSnapshot> = (globalThis as any).__finarySnapshotCache ??= new Map();

function mapAccount(account: FintermFinaryAccount): BrokerAccount {
  const institution = account.institution?.trim();
  const name = account.name.trim();
  const displayName = institution && institution !== name ? `${institution} - ${name}` : name;
  const isCashAccount = ["bank_account", "savings", "employee_savings"].includes(account.account_type);

  return {
    accountId: account.id,
    name: displayName,
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
  return null;
}

function mapPosition(account: FintermFinaryAccount, holding: FintermFinaryHolding): BrokerPosition | null {
  const ticker = resolveTicker(holding);
  if (!ticker) return null;

  let assetCategory = "OTHER";
  const rawType = holding.asset_type.toLowerCase();
  if (rawType.includes("stock") || rawType.includes("etf")) assetCategory = "STK";
  else if (rawType.includes("crypto")) assetCategory = "CRYPTO";
  else if (rawType.includes("fund")) assetCategory = "FUND";

  return {
    ticker,
    exchange: "FINARY",
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

  async importPositions(): Promise<BrokerPosition[]> {
    const snapshot = await this.loadSnapshot();
    const validAccounts = snapshot.accounts.filter((account) => (
      account.holdings.some((holding) => resolveTicker(holding) !== null)
    ));
    const positions = validAccounts.flatMap((account) => (
      account.holdings.flatMap((holding) => {
        const position = mapPosition(account, holding);
        return position ? [position] : [];
      })
    ));
    finaryLog.info("Imported Finary positions", {
      totalAccountCount: snapshot.accounts.length,
      validAccountCount: validAccounts.length,
      positionCount: positions.length,
    });
    return positions;
  }
}
