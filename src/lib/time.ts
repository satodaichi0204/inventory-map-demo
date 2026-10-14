/** 「3分前に更新」の「3分前」の部分 */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (sec < 60) return "たった今";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  return `${Math.floor(hour / 24)}日前`;
}

const absoluteFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 「10/14 15:31」 */
export function formatAbsolute(date: Date | string): string {
  return absoluteFormat.format(typeof date === "string" ? new Date(date) : date);
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

/** 「3分前に更新」「たった今更新」 */
export function formatUpdated(date: Date | string, now: Date = new Date()): string {
  const relative = formatRelative(date, now);
  return relative === "たった今" ? "たった今更新" : `${relative}に更新`;
}
