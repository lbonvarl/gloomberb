import type { Portfolio, PortfolioOwnershipShare } from "../types/ticker";

export function getPortfolioOwnership(portfolio: Portfolio | null | undefined): PortfolioOwnershipShare[] {
  return portfolio?.ownership?.filter((entry) => Number.isFinite(entry.share) && entry.share > 0) ?? [];
}

export function getPortfolioOwnerNames(portfolio: Portfolio | null | undefined): string[] {
  return getPortfolioOwnership(portfolio).map((entry) => entry.name);
}

export function getPortfolioOwnerShare(portfolio: Portfolio | null | undefined, ownerName: string | null | undefined): number {
  if (!ownerName) return 1;
  const share = getPortfolioOwnership(portfolio).find((entry) => entry.name === ownerName)?.share;
  return typeof share === "number" && Number.isFinite(share) && share > 0 ? share : 0;
}
