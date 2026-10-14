// JANコード（EAN-13 / EAN-8）のチェックディジット
// データベース側の public.is_valid_jan と同じ計算をする

/** チェックディジットを除いた数字列（7桁または12桁）から、チェックディジットを求める */
export function computeJanCheckDigit(body: string): number {
  if (!/^(\d{7}|\d{12})$/.test(body)) {
    throw new Error(`JANコードの本体は7桁または12桁の数字です: ${body}`);
  }
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // チェックディジットの左隣から、重み 3,1,3,1... の順
    const weight = (body.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidJan(code: string): boolean {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;
  return computeJanCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/** 本体にチェックディジットを付けた、完全なJANコードを返す */
export function withCheckDigit(body: string): string {
  return body + computeJanCheckDigit(body);
}
