import { describe, it, expect, vi } from "bun:test";
import { FinaryClient } from "./client";
import { loadFintermFinaryPortfolio } from "./auth";
import type { BrokerInstanceConfig } from "../../types/config";
import type { DataProvider } from "../../types/data-provider";

vi.mock("./auth", () => ({
  loadFintermFinaryPortfolio: vi.fn(),
}));

const mockInstance: BrokerInstanceConfig = {
  id: "finary-test",
  brokerId: "finary",
  name: "Finary",
  enabled: true,
  config: {
    email: "test@example.com",
    password: "password",
  },
};

const mockPortfolio = {
  net_worth_gross: 1000,
  net_worth_net: 1000,
  accounts: [
    {
      id: "acc1",
      name: "PEA",
      account_type: "brokerage",
      institution: "Fortuneo",
      balance: 500,
      currency: "EUR",
      sync_source: "finary",
      ownership: [{ name: "Loic", share: 1.0 }],
      holdings: [
        {
          name: "Air Liquide",
          symbol: "AI.PA",
          quantity: 10,
          buying_price: 150,
          current_price: 160,
          current_value: 1600,
          asset_type: "stock",
        },
      ],
    },
    {
      id: "acc2",
      name: "Empty Account",
      account_type: "savings",
      institution: "LCL",
      balance: 100,
      currency: "EUR",
      sync_source: "finary",
      ownership: [{ name: "Loic", share: 1.0 }],
      holdings: [],
    },
    {
      id: "acc3",
      name: "Manual Real Estate",
      account_type: "real_estate",
      institution: "Manual",
      balance: 200000,
      currency: "EUR",
      sync_source: "finary",
      ownership: [{ name: "Loic", share: 1.0 }],
      holdings: [
        {
          name: "Main Residence",
          asset_type: "real_estate",
          current_value: 200000,
        },
      ],
    },
    {
      id: "acc4",
      name: "Non-trackable Holdings",
      account_type: "brokerage",
      institution: "Test",
      balance: 1000,
      currency: "EUR",
      sync_source: "finary",
      ownership: [{ name: "Loic", share: 1.0 }],
      holdings: [
        {
          name: "Internal ID",
          symbol: "FY0000094129",
          asset_type: "stock",
        },
        {
          name: "Liquidity",
          symbol: "XX-LIQUIDITY",
          asset_type: "stock",
        },
      ],
    },
  ],
};

describe("FinaryClient", () => {
  it("should filter out accounts with no trackable holdings", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue(mockPortfolio as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-resolve-exact" });
    
    const accounts = await client.listAccounts();
    // Only acc1 has trackable holdings (AI.PA).
    // acc2 is empty, acc3 is manual real estate (no ticker), acc4 has only non-trackable IDs.
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountId).toBe("acc1");
    expect(accounts[0].name).toBe("PEA");
  });

  it("should correctly map positions for valid accounts", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue(mockPortfolio as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-resolve-safe-fallback" });
    
    const positions = await client.importPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("AI.PA");
    expect(positions[0].assetCategory).toBe("STK");
  });

  it("resolves partial Finary symbols to full ticker symbols from exact ISIN matches", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Amundi MSCI World",
              symbol: "CW8",
              isin: "LU1681043599",
              quantity: 3,
              buying_price: 400,
              current_price: 420,
              current_value: 1260,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient(mockInstance);
    const dataProvider = {
      search: vi.fn(async () => [
        {
          providerId: "yahoo",
          symbol: "CW8.PA",
          name: "Amundi MSCI World UCITS ETF",
          exchange: "PAR",
          type: "ETF",
          isin: "LU1681043599",
        },
      ]),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(dataProvider.search).toHaveBeenCalledWith("LU1681043599");
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("CW8.PA");
    expect(positions[0].exchange).toBe("PAR");
  });

  it("resolves partial symbols from a single Yahoo-style ticker extension when ISIN is omitted", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Amundi MSCI World",
              symbol: "CW8",
              isin: "LU1681043599",
              quantity: 3,
              buying_price: 400,
              current_price: 420,
              current_value: 1260,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-resolve-yahoo-extension" });
    const dataProvider = {
      search: vi.fn(async () => [
        {
          providerId: "yahoo",
          symbol: "CW8.PA",
          name: "Amundi MSCI World UCITS ETF",
          exchange: "PAR",
          type: "ETF",
        },
      ]),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("CW8.PA");
    expect(positions[0].exchange).toBe("PAR");
  });

  it("does not replace partial symbols when the only search result does not match the base symbol", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Amundi MSCI World",
              symbol: "CW8",
              isin: "LU1681043599",
              quantity: 3,
              buying_price: 400,
              current_price: 420,
              current_value: 1260,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient(mockInstance);
    const dataProvider = {
      search: vi.fn(async () => [
        {
          providerId: "yahoo",
          symbol: "WPEA.PA",
          name: "Different ETF",
          exchange: "PAR",
          type: "ETF",
        },
      ]),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("CW8");
    expect(positions[0].exchange).toBe("FINARY");
  });

  it("resolves single unrelated symbols when the provider result strongly matches the holding name", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Gold Bullion Securities ETC",
              symbol: "GBS",
              isin: "GB00B00FHZ82",
              quantity: 2,
              buying_price: 200,
              current_price: 210,
              current_value: 420,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-name-confirmed-match" });
    const dataProvider = {
      search: vi.fn(async () => [
        {
          providerId: "yahoo",
          symbol: "OGG9.L",
          name: "Gold Bullion Securities ETC",
          exchange: "LSE",
          type: "EQUITY",
        },
      ]),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("OGG9.L");
    expect(positions[0].exchange).toBe("LONDON");
  });

  it("does not replace unrelated symbols when neither ISIN nor name lookup is trustworthy", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Example Assurance Fund",
              symbol: "EAF",
              isin: "ZZ0000000001",
              quantity: 2,
              buying_price: 200,
              current_price: 210,
              current_value: 420,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-name-confirmed-reject" });
    const dataProvider = {
      search: vi.fn(async () => [
        {
          providerId: "yahoo",
          symbol: "OGG9.L",
          name: "Commodity Tracker London",
          exchange: "LSE",
          type: "EQUITY",
        },
      ]),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("EAF");
    expect(positions[0].exchange).toBe("FINARY");
  });

  it("prefers chartable ETF name-search matches over Stuttgart mutual fund ISIN hits", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Amundi MSCI World SRI Climate Net Zero Ambition PAB UCITS ETF EUR Acc",
              symbol: "XAMB",
              isin: "IE000Y77LGG9",
              quantity: 3,
              buying_price: 80,
              current_price: 100,
              current_value: 300,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-name-search-etf-preferred" });
    const dataProvider = {
      search: vi.fn(async (query: string) => {
        if (query === "IE000Y77LGG9") {
          return [{
            providerId: "yahoo",
            symbol: "IE000Y77LGG9.SG",
            name: "Amundi MSCI World SRI Climate N",
            exchange: "Stuttgart",
            type: "MUTUALFUND",
          }];
        }
        return [{
          providerId: "yahoo",
          symbol: "XAMB.DE",
          name: "Am.ETF-MSCI W.SRI Cl.Par.Alig.B",
          exchange: "XETRA",
          type: "ETF",
        }];
      }),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("XAMB.DE");
    expect(positions[0].exchange).toBe("XETRA");
  });

  it("prefers stronger ETF candidates from multi-result ISIN searches", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Amundi Core MSCI World UCITS ETF Acc",
              symbol: "MWRD",
              isin: "IE000BI8OT95",
              quantity: 3,
              buying_price: 130,
              current_price: 145,
              current_value: 435,
              asset_type: "etf",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-multi-result-preferred" });
    const dataProvider = {
      search: vi.fn(async (query: string) => {
        if (query === "IE000BI8OT95") {
          return [
            {
              providerId: "yahoo",
              symbol: "WRDU.AS",
              name: "Amundi Core MSCI World UCITS ET",
              exchange: "Amsterdam",
              type: "ETF",
            },
            {
              providerId: "yahoo",
              symbol: "IE000BI8OT95.SG",
              name: "Amundi MSCI World UCITS ETF - U",
              exchange: "Stuttgart",
              type: "MUTUALFUND",
            },
          ];
        }
        return [
          {
            providerId: "yahoo",
            symbol: "MWRD.PA",
            name: "Amundi Core MSCI World UCITS ET",
            exchange: "Paris",
            type: "ETF",
          },
        ];
      }),
    } as Partial<DataProvider> as DataProvider;

    const positions = await client.importPositions(dataProvider);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("MWRD.PA");
    expect(positions[0].exchange).toBe("PARIS");
  });

  it("maps known Fidelity pooled fund names to chartable proxy symbols", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "SP 500 INDEX PL CL D",
              symbol: null,
              isin: null,
              quantity: 12,
              buying_price: 200,
              current_price: 220,
              current_value: 2640,
              asset_type: "fund",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-known-name-override" });

    const positions = await client.importPositions();

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("FXAIX");
    expect(positions[0].exchange).toBe("");
  });

  it("uses known ISIN overrides for chartable SP5 and AXA fund symbols", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue({
      ...mockPortfolio,
      accounts: [
        {
          ...mockPortfolio.accounts[0],
          holdings: [
            {
              name: "Amundi S&P 500 II UCITS ETF EUR Dist",
              symbol: "SP5",
              isin: "LU0496786574",
              quantity: 10,
              buying_price: 50,
              current_price: 60,
              current_value: 600,
              asset_type: "etf",
            },
            {
              name: "AXA World Funds - Framlington Social Progress A Capitalisation EUR",
              symbol: "4TK0",
              isin: "LU1557118921",
              quantity: 10,
              buying_price: 100,
              current_price: 110,
              current_value: 1100,
              asset_type: "fund",
            },
          ],
        },
      ],
    } as any);
    const client = new FinaryClient({ ...mockInstance, id: "finary-known-isin-overrides" });

    const positions = await client.importPositions();

    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({ ticker: "LYPS.DE", exchange: "XETRA" });
    expect(positions[1]).toMatchObject({ ticker: "0P00019VOY.F", exchange: "FRANKFURT" });
  });
});
