import { describe, expect, it } from "vitest";
import { escapeLike, normalizeForSearch } from "./normalize";

describe("normalizeForSearch", () => {
  it("カタカナをひらがなにそろえる", () => {
    expect(normalizeForSearch("ミネラルウォーター")).toBe("みねらるうぉーたー");
  });

  it("半角カナを全角にしてから、ひらがなにそろえる", () => {
    expect(normalizeForSearch("ﾐﾈﾗﾙｳｫｰﾀｰ")).toBe("みねらるうぉーたー");
    expect(normalizeForSearch("ｶﾞﾑ")).toBe("がむ");
  });

  it("全角英数を半角の小文字にそろえる", () => {
    expect(normalizeForSearch("ＡＢＣ　５００ｍｌ")).toBe("abc500ml");
    expect(normalizeForSearch("Green Tea")).toBe("greentea");
  });

  it("同じ商品名の違う書き方が同じ値になる", () => {
    expect(normalizeForSearch("サクッと塩チップス")).toBe(
      normalizeForSearch("さくっと しおチップス".replace("しお", "塩")),
    );
    expect(normalizeForSearch("やさしい麦茶 600ml")).toBe(normalizeForSearch("ヤサシイ麦茶６００ＭＬ"));
  });
});

describe("escapeLike", () => {
  it("LIKE のワイルドカードをエスケープする", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("普通の文字")).toBe("普通の文字");
  });
});
