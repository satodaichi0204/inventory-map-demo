// 商品名の検索用の正規化
// 全角半角（ＡＢＣ / ｱｲｳ）、大文字小文字、カタカナとひらがな、空白の違いを吸収する。
// products.name_normalized に保存する値と、検索語の両方に同じ処理をかける。

export function normalizeForSearch(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

/** LIKE検索のワイルドカード（% と _）と、エスケープ文字をエスケープする */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
