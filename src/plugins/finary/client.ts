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
  return {
    accountId: account.id,
    name: account.institution?.trim() || account.name,
    currency: account.currency || "EUR",
    source: account.sync_source,
    updatedAt: account.last_sync_at ? Date.parse(account.last_sync_at) : undefined,
    netLiquidation: account.balance,
    ownership: account.ownership,
  };
}

function resolveTicker(holding: FintermFinaryHolding): string | null {
  const symbol = holding.symbol?.trim();
  if (symbol) return symbol.replace(/\s+/g, "-").toUpperCase();
  const isin = holding.isin?.trim();
  if (isin) return isin.toUpperCase();
  return null;
}

function mapPosition(account: FintermFinaryAccount, holding: FintermFinaryHolding): BrokerPosition | null {
  const ticker = resolveTicker(holding);
  if (!ticker) return null;
  return {
    ticker,
    exchange: "FINARY",
    shares: holding.quantity ?? 0,
    avgCost: holding.buying_price ?? 0,
    currency: holding.currency ?? account.currency ?? "EUR",
    accountId: account.id,
    name: holding.name,
    assetCategory: holding.asset_type.toUpperCase(),
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
    finaryLog.info("Loaded Finary accounts", {
      accountCount: snapshot.accounts.length,
    });
    return snapshot.accounts.map(mapAccount);
  }

  async importPositions(): Promise<BrokerPosition[]> {
    const snapshot = await this.loadSnapshot();
    const positions = snapshot.accounts.flatMap((account) => (
      account.holdings.flatMap((holding) => {
        const position = mapPosition(account, holding);
        return position ? [position] : [];
      })
    ));
    finaryLog.info("Imported Finary positions", {
      accountCount: snapshot.accounts.length,
      positionCount: positions.length,
    });
    return positions;
  }
}
