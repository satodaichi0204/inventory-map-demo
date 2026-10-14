import { describe, expect, it } from "vitest";
import { applyInventoryChange, stockLabel, stockLevel } from "./stock";

describe("applyInventoryChange", () => {
  it("+1 で増え、種類は increase になる", () => {
    expect(applyInventoryChange(5, { type: "adjust", delta: 1 })).toEqual({ after: 6, changeType: "increase" });
  });

  it("-1 で減り、種類は decrease になる", () => {
    expect(applyInventoryChange(5, { type: "adjust", delta: -1 })).toEqual({ after: 4, changeType: "decrease" });
    expect(applyInventoryChange(1, { type: "adjust", delta: -1 })).toEqual({ after: 0, changeType: "decrease" });
  });

  it("0未満になる減少は拒否する", () => {
    expect(() => applyInventoryChange(0, { type: "adjust", delta: -1 })).toThrow("0未満");
    expect(() => applyInventoryChange(2, { type: "adjust", delta: -3 })).toThrow("0未満");
  });

  it("増減が0や小数なら拒否する", () => {
    expect(() => applyInventoryChange(5, { type: "adjust", delta: 0 })).toThrow();
    expect(() => applyInventoryChange(5, { type: "adjust", delta: 1.5 })).toThrow();
  });

  it("棚卸しは値を上書きし、種類は stocktake になる", () => {
    expect(applyInventoryChange(5, { type: "set", quantity: 12 })).toEqual({ after: 12, changeType: "stocktake" });
    expect(applyInventoryChange(5, { type: "set", quantity: 0 })).toEqual({ after: 0, changeType: "stocktake" });
  });

  it("棚卸しで負の数や小数は拒否する", () => {
    expect(() => applyInventoryChange(5, { type: "set", quantity: -1 })).toThrow();
    expect(() => applyInventoryChange(5, { type: "set", quantity: 2.5 })).toThrow();
  });
});

describe("stockLevel / stockLabel", () => {
  it("数に応じて段階を返す", () => {
    expect(stockLevel(null)).toBe("out");
    expect(stockLevel(0)).toBe("out");
    expect(stockLevel(1)).toBe("low");
    expect(stockLevel(3)).toBe("low");
    expect(stockLevel(4)).toBe("in_stock");
  });

  it("表示の設定で、正確な数と段階表示を切り替える", () => {
    expect(stockLabel(12, "exact")).toBe("在庫あり（12個）");
    expect(stockLabel(2, "exact")).toBe("残りわずか（2個）");
    expect(stockLabel(12, "level")).toBe("在庫あり");
    expect(stockLabel(2, "level")).toBe("残りわずか");
    expect(stockLabel(0, "level")).toBe("在庫なし");
  });
});
