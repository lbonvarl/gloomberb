import { describe, it, expect, vi } from "bun:test";
import { FinaryClient } from "./client";
import { loadFintermFinaryPortfolio } from "./auth";
import type { BrokerInstanceConfig } from "../../types/config";

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
    const client = new FinaryClient(mockInstance);
    
    const accounts = await client.listAccounts();
    // Only acc1 has trackable holdings (AI.PA).
    // acc2 is empty, acc3 is manual real estate (no ticker), acc4 has only non-trackable IDs.
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountId).toBe("acc1");
    expect(accounts[0].name).toBe("Fortuneo - PEA");
  });

  it("should correctly map positions for valid accounts", async () => {
    (loadFintermFinaryPortfolio as any).mockResolvedValue(mockPortfolio as any);
    const client = new FinaryClient(mockInstance);
    
    const positions = await client.importPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("AI.PA");
    expect(positions[0].assetCategory).toBe("STK");
  });
});
