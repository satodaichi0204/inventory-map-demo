import { describe, expect, it } from "vitest";
import { computeJanCheckDigit, isValidJan, withCheckDigit } from "./jan";

describe("computeJanCheckDigit", () => {
  it("EAN-13 のチェックディジットを求める", () => {
    expect(computeJanCheckDigit("490123456789")).toBe(4); // 4901234567894
    expect(computeJanCheckDigit("400638133393")).toBe(1); // 4006381333931
  });

  it("EAN-8 のチェックディジットを求める", () => {
    expect(computeJanCheckDigit("4902102")).toBe(8); // 49021028
    expect(computeJanCheckDigit("9638507")).toBe(4); // 96385074
  });

  it("桁数が違うとエラーにする", () => {
    expect(() => computeJanCheckDigit("123")).toThrow();
    expect(() => computeJanCheckDigit("49012345678a")).toThrow();
  });
});

describe("isValidJan", () => {
  it("正しいJANコードを受け付ける", () => {
    expect(isValidJan("4901234567894")).toBe(true);
    expect(isValidJan("4006381333931")).toBe(true);
    expect(isValidJan("49021028")).toBe(true);
  });

  it("チェックディジットが違うものを拒否する", () => {
    expect(isValidJan("4901234567890")).toBe(false);
    expect(isValidJan("49021020")).toBe(false);
  });

  it("桁数や文字が違うものを拒否する", () => {
    expect(isValidJan("")).toBe(false);
    expect(isValidJan("490123456789")).toBe(false);
    expect(isValidJan("49012345678945")).toBe(false);
    expect(isValidJan("490123456789a")).toBe(false);
    expect(isValidJan(" 4901234567894")).toBe(false);
  });

  it("withCheckDigit で作ったコードは常に正しい", () => {
    for (let i = 0; i < 200; i++) {
      const body = String(200000000000 + i * 7919).padStart(12, "0");
      expect(isValidJan(withCheckDigit(body))).toBe(true);
    }
  });
});
