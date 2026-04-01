import type { RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { DataTable } from "../../../components";
import { colors } from "../../../theme/colors";
import type { ColumnConfig } from "../../../types/config";
import type { TickerFinancials } from "../../../types/financials";
import type { TickerRecord } from "../../../types/ticker";
import { getColumnValue, type ColumnContext } from "./metrics";

export type QuoteFlashDirection = "up" | "down" | "flat";

const FLASHABLE_QUOTE_COLUMN_IDS = new Set([
  "price",
  "change",
  "change_pct",
  "bid",
  "ask",
  "spread",
  "ext_hours",
  "market_cap",
  "mkt_value",
  "pnl",
  "pnl_pct",
]);

function resolveQuoteFlashColor(
  direction: QuoteFlashDirection,
  fallbackColor: string,
): string {
  switch (direction) {
    case "up":
      return colors.positive;
    case "down":
      return colors.negative;
    default:
      return fallbackColor === colors.textDim ? colors.text : colors.textBright;
  }
}

export function PortfolioTickerTable({
  columns,
  sortColumnId,
  sortDirection,
  onHeaderClick,
  headerScrollRef,
  scrollRef,
  syncHeaderScroll,
  onBodyScrollActivity,
  sortedTickers,
  cursorSymbol,
  hoveredIdx,
  setHoveredIdx,
  setCursorSymbol,
  financialsMap,
  columnContext,
  flashSymbols,
}: {
  columns: ColumnConfig[];
  sortColumnId: string | null;
  sortDirection: "asc" | "desc";
  onHeaderClick: (columnId: string) => void;
  headerScrollRef: RefObject<ScrollBoxRenderable | null>;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  syncHeaderScroll: () => void;
  onBodyScrollActivity: () => void;
  sortedTickers: TickerRecord[];
  cursorSymbol: string | null;
  hoveredIdx: number | null;
  setHoveredIdx: (index: number | null) => void;
  setCursorSymbol: (symbol: string) => void;
  financialsMap: Map<string, TickerFinancials>;
  columnContext: ColumnContext;
  flashSymbols: Map<string, QuoteFlashDirection>;
}) {
  return (
    <DataTable
      columns={columns}
      items={sortedTickers}
      sortColumnId={sortColumnId}
      sortDirection={sortDirection}
      onHeaderClick={onHeaderClick}
      headerScrollRef={headerScrollRef}
      scrollRef={scrollRef}
      syncHeaderScroll={syncHeaderScroll}
      onBodyScrollActivity={onBodyScrollActivity}
      emptyStateTitle="No tickers."
      emptyStateHint="Press Ctrl+P to add one."
      hoveredIdx={hoveredIdx}
      setHoveredIdx={setHoveredIdx}
      getItemKey={(ticker) => ticker.metadata.ticker}
      isSelected={(ticker) => ticker.metadata.ticker === cursorSymbol}
      onSelect={(ticker) => setCursorSymbol(ticker.metadata.ticker)}
      renderCell={(ticker, column, _index, rowState) => {
        const financials = financialsMap.get(ticker.metadata.ticker);
        const { text, color } = getColumnValue(
          column,
          ticker,
          financials,
          columnContext,
        );
        const baseFg =
          color || (rowState.selected ? colors.selectedText : colors.text);
        const flashDirection = flashSymbols.get(ticker.metadata.ticker);
        const shouldFlash =
          flashDirection != null && FLASHABLE_QUOTE_COLUMN_IDS.has(column.id);
        const cellFg = shouldFlash
          ? resolveQuoteFlashColor(flashDirection, baseFg)
          : baseFg;
        return { text, color: cellFg };
      }}
    />
  );
}
