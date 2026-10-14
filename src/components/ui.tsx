"use client";

import type { StockDisplayMode } from "@/config";
import { stockLabel, stockLevel } from "@/lib/stock";
import { formatAbsolute, formatRelative } from "@/lib/time";

const BADGE_CLASS = {
  in_stock: "bg-green-100 text-green-800 ring-green-600/30",
  low: "bg-amber-100 text-amber-900 ring-amber-600/30",
  out: "bg-gray-100 text-gray-600 ring-gray-500/30",
} as const;

export function StockBadge({ quantity, mode }: { quantity: number | null | undefined; mode: StockDisplayMode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_CLASS[stockLevel(quantity)]}`}
    >
      {stockLabel(quantity, mode)}
    </span>
  );
}

export function UpdatedAt({ at, now }: { at: string | null | undefined; now: Date }) {
  if (!at) return <span className="text-xs text-gray-500">更新記録なし</span>;
  return (
    <span className="text-xs text-gray-500" title={formatAbsolute(at)}>
      {formatRelative(at, now)}に更新（{formatAbsolute(at)}）
    </span>
  );
}

export function LiveIndicator({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600" aria-live="polite">
      <span className={`relative flex h-2.5 w-2.5`}>
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-green-500" : "bg-gray-400"}`} />
      </span>
      {live ? "リアルタイム反映中" : "接続中…"}
    </span>
  );
}

export function DisplayModeToggle({
  mode,
  onChange,
}: {
  mode: StockDisplayMode;
  onChange: (m: StockDisplayMode) => void;
}) {
  const option = (value: StockDisplayMode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={mode === value}
      className={`px-2.5 py-1 text-xs font-medium ${mode === value ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-gray-500">在庫の表示</span>
      <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
        {option("exact", "個数")}
        {option("level", "段階")}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[90vw] rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}
