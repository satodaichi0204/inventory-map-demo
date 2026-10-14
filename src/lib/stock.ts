import { LOW_STOCK_THRESHOLD, type StockDisplayMode } from "@/config";

export type StockLevel = "in_stock" | "low" | "out";

export function stockLevel(quantity: number | null | undefined, lowThreshold = LOW_STOCK_THRESHOLD): StockLevel {
  if (!quantity || quantity <= 0) return "out";
  if (quantity <= lowThreshold) return "low";
  return "in_stock";
}

export function stockLabel(quantity: number | null | undefined, mode: StockDisplayMode): string {
  const level = stockLevel(quantity);
  if (level === "out") return "在庫なし";
  if (mode === "exact") return level === "low" ? `残りわずか（${quantity}個）` : `在庫あり（${quantity}個）`;
  return level === "low" ? "残りわずか" : "在庫あり";
}

export const STOCK_COLORS: Record<StockLevel | "none", string> = {
  in_stock: "#16a34a",
  low: "#f59e0b",
  out: "#9ca3af",
  none: "#2563eb", // 商品を選んでいないとき
};

export type InventoryChange = { type: "adjust"; delta: number } | { type: "set"; quantity: number };

export type ChangeType = "increase" | "decrease" | "stocktake";

/**
 * 在庫の変更を適用した結果を返す。データベースの adjust_inventory / set_inventory と同じ規則。
 * 画面で、押す前に結果を判定するために使う。
 */
export function applyInventoryChange(
  current: number,
  change: InventoryChange,
): { after: number; changeType: ChangeType } {
  if (!Number.isInteger(current) || current < 0) throw new Error("現在の在庫数が正しくありません");
  if (change.type === "adjust") {
    if (!Number.isInteger(change.delta) || change.delta === 0) throw new Error("増減する数を指定してください");
    const after = current + change.delta;
    if (after < 0) throw new Error(`在庫数を0未満にはできません（現在 ${current} 個）`);
    return { after, changeType: change.delta > 0 ? "increase" : "decrease" };
  }
  if (!Number.isInteger(change.quantity) || change.quantity < 0)
    throw new Error("在庫数は0以上の整数で指定してください");
  return { after: change.quantity, changeType: "stocktake" };
}
