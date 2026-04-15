import { describe, expect, test } from "bun:test";
import { createDefaultConfig, type BrokerInstanceConfig } from "../types/config";
import type { BrokerAdapter } from "../types/broker";
import type { DataProvider } from "../types/data-provider";
import type { TickerRecord } from "../types/ticker";
import { syncBrokerInstance } from "./sync-broker-instance";

function createTickerRepository(initial: TickerRecord[] = []) {
  const tickers = new Map(initial.map((ticker) => [ticker.metadata.ticker, ticker] as const));

  return {
    async loadAllTickers() {
      return [...tickers.values()];
    },
    async loadTicker(symbol: string) {
      return tickers.get(symbol) ?? null;
    },
    async saveTicker(ticker: TickerRecord) {
      tickers.set(ticker.metadata.ticker, ticker);
    },
    async createTicker(metadata: TickerRecord["metadata"]) {
      const ticker = { metadata };
      tickers.set(metadata.ticker, ticker);
      return ticker;
    },
    async deleteTicker(symbol: string) {
      tickers.delete(symbol);
    },
  };
}

function createBrokerInstance(): BrokerInstanceConfig {
  return {
    id: "demo-broker",
    brokerType: "demo",
    label: "Demo Broker",
    config: { apiKey: "demo-key" },
    enabled: true,
  };
}

function createDemoBroker(): BrokerAdapter {
  return {
    id: "demo",
    name: "Demo Broker",
    configSchema: [{ key: "apiKey", label: "API Key", type: "text", required: true }],
    validate: async () => true,
    listAccounts: async () => [{
      accountId: "ACC-1",
      name: "Primary",
      currency: "USD",
      ownership: [{ name: "Loic", share: 0.5 }],
    }],
    importPositions: async () => [{
      ticker: "AAPL",
      exchange: "NASDAQ",
      shares: 12,
      avgCost: 180,
      currency: "USD",
      accountId: "ACC-1",
      name: "Apple Inc.",
      assetCategory: "STK",
    }],
  };
}

function createResolvingBroker(): BrokerAdapter {
  return {
    id: "demo",
    name: "Demo Broker",
    configSchema: [{ key: "apiKey", label: "API Key", type: "text", required: true }],
    validate: async () => true,
    listAccounts: async () => [{
      accountId: "ACC-1",
      name: "Primary",
      currency: "EUR",
    }],
    importPositions: async (_instance, dataProvider) => {
      const resolved = await dataProvider?.search("LU1681043599") ?? [];
      return [{
        ticker: resolved[0]?.symbol ?? "CW8",
        exchange: "FINARY",
        shares: 10,
        avgCost: 450,
        currency: "EUR",
        accountId: "ACC-1",
        name: "Amundi MSCI World UCITS ETF - EUR (C)",
        assetCategory: "STK",
        isin: "LU1681043599",
      }];
    },
  };
}

describe("syncBrokerInstance", () => {
  test("creates broker portfolios and imports positions into local tickers", async () => {
    const config = {
      ...createDefaultConfig("/tmp/gloomberb-sync-broker-instance"),
      portfolios: [],
      brokerInstances: [createBrokerInstance()],
    };
    const tickerRepository = createTickerRepository();

    const result = await syncBrokerInstance({
      config,
      instanceId: "demo-broker",
      brokers: new Map([["demo", createDemoBroker()]]),
      tickerRepository: tickerRepository as any,
    });

    expect(result.portfolioIds).toEqual(["broker:demo-broker:ACC-1"]);
    expect(result.config.portfolios).toEqual([
      {
        id: "broker:demo-broker:ACC-1",
        name: "Primary",
        currency: "USD",
        brokerId: "demo",
        brokerInstanceId: "demo-broker",
        brokerAccountId: "ACC-1",
        ownership: [{ name: "Loic", share: 0.5 }],
      },
    ]);
    expect(result.positions).toHaveLength(1);
    expect(result.addedTickers).toHaveLength(1);
    expect(result.tickers.get("AAPL")?.metadata.positions).toEqual([
      expect.objectContaining({
        portfolio: "broker:demo-broker:ACC-1",
        broker: "demo",
        shares: 12,
        brokerInstanceId: "demo-broker",
        brokerAccountId: "ACC-1",
      }),
    ]);
  });

  test("passes data provider through sync and replaces stale partial ticker positions", async () => {
    const config = {
      ...createDefaultConfig("/tmp/gloomberb-sync-broker-instance-resolution"),
      portfolios: [{
        id: "broker:demo-broker:ACC-1",
        name: "Primary",
        currency: "EUR",
        brokerId: "demo",
        brokerInstanceId: "demo-broker",
        brokerAccountId: "ACC-1",
      }],
      brokerInstances: [createBrokerInstance()],
    };
    const tickerRepository = createTickerRepository([
      {
        metadata: {
          ticker: "CW8",
          exchange: "FINARY",
          currency: "EUR",
          name: "Amundi MSCI World UCITS ETF - EUR (C)",
          isin: "LU1681043599",
          assetCategory: "STK",
          portfolios: ["broker:demo-broker:ACC-1"],
          watchlists: [],
          positions: [{
            portfolio: "broker:demo-broker:ACC-1",
            shares: 5,
            avgCost: 400,
            currency: "EUR",
            broker: "demo",
            brokerInstanceId: "demo-broker",
            brokerAccountId: "ACC-1",
          }],
          broker_contracts: [],
          custom: {},
          tags: [],
        },
      },
    ]);
    const dataProvider: DataProvider = {
      id: "test-provider",
      name: "Test Provider",
      async getTickerFinancials() {
        return { annualStatements: [], quarterlyStatements: [], priceHistory: [] };
      },
      async getQuote() {
        throw new Error("not used");
      },
      async getExchangeRate() {
        return 1;
      },
      async search(query: string) {
        if (query === "LU1681043599") {
          return [{
            providerId: "test-provider",
            symbol: "CW8.PA",
            name: "Amundi MSCI World Swap UCITS ETF",
            exchange: "Paris",
            type: "ETF",
          }];
        }
        return [];
      },
      async getNews() {
        return [];
      },
      async getArticleSummary() {
        return null;
      },
      async getPriceHistory() {
        return [];
      },
    };

    const result = await syncBrokerInstance({
      config,
      instanceId: "demo-broker",
      brokers: new Map([["demo", createResolvingBroker()]]),
      tickerRepository: tickerRepository as any,
      dataProvider,
    });

    expect(result.positions[0]?.ticker).toBe("CW8.PA");
    expect(result.tickers.get("CW8.PA")?.metadata.positions).toEqual([
      expect.objectContaining({
        portfolio: "broker:demo-broker:ACC-1",
        shares: 10,
        brokerInstanceId: "demo-broker",
      }),
    ]);
    expect(result.tickers.has("CW8")).toBe(false);
  });
});
