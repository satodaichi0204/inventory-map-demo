import { describe, expect, it } from "vitest";
import { formatDistance, formatRelative } from "./time";

describe("formatRelative", () => {
  const now = new Date("2026-10-14T12:00:00+09:00");
  const ago = (sec: number) => new Date(now.getTime() - sec * 1000);

  it("経過時間を日本語で返す", () => {
    expect(formatRelative(ago(10), now)).toBe("たった今");
    expect(formatRelative(ago(5 * 60), now)).toBe("5分前");
    expect(formatRelative(ago(3 * 3600), now)).toBe("3時間前");
    expect(formatRelative(ago(2 * 86400), now)).toBe("2日前");
  });

  it("未来の日時（端末の時計のずれ）は「たった今」にする", () => {
    expect(formatRelative(ago(-30), now)).toBe("たった今");
  });
});

describe("formatDistance", () => {
  it("1km未満はm、それ以上はkmで返す", () => {
    expect(formatDistance(350.4)).toBe("350m");
    expect(formatDistance(1530)).toBe("1.5km");
  });
});
