"use client";

import type { ReactNode, SVGProps } from "react";
import type { StockDisplayMode } from "@/config";
import { STOCK_COLORS, stockLabel, stockLevel } from "@/lib/stock";
import { formatAbsolute, formatUpdated } from "@/lib/time";

// ---------------------------------------------------------------------------
// アイコン（線画。外部ライブラリを増やさないよう、使う分だけ定義する）
// ---------------------------------------------------------------------------
type IconProps = SVGProps<SVGSVGElement>;
function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const LocateIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="7.5" />
  </Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);
export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
  </Icon>
);
export const ScanIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8" />
  </Icon>
);
export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </Icon>
);
export const BoxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 7.5 8.5-4.5 8.5 4.5v9L12 21l-8.5-4.5z" />
    <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" />
  </Icon>
);
export const StoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10v10h16V10M3 10l1.5-6h15L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);

// ---------------------------------------------------------------------------
// 在庫の表示
// ---------------------------------------------------------------------------
const BADGE_CLASS = {
  in_stock: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  low: "bg-amber-50 text-amber-800 ring-amber-600/25",
  out: "bg-slate-100 text-slate-500 ring-slate-400/20",
} as const;

export function StockBadge({ quantity, mode }: { quantity: number | null | undefined; mode: StockDisplayMode }) {
  const level = stockLevel(quantity);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_CLASS[level]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STOCK_COLORS[level] }} />
      {stockLabel(quantity, mode)}
    </span>
  );
}

export function UpdatedAt({ at, now, compact }: { at: string | null | undefined; now: Date; compact?: boolean }) {
  if (!at) return <span className="text-xs text-slate-400">更新記録なし</span>;
  return (
    <span className="whitespace-nowrap text-xs text-slate-500" title={formatAbsolute(at)}>
      {formatUpdated(at, now)}{!compact && <span className="text-slate-400">（{formatAbsolute(at)}）</span>}
    </span>
  );
}

export function LiveIndicator({ live, className = "" }: { live: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600 ${className}`}
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />
      </span>
      {live ? "リアルタイム反映中" : "接続中…"}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DisplayModeToggle({
  mode,
  onChange,
}: {
  mode: StockDisplayMode;
  onChange: (m: StockDisplayMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-slate-500">在庫の表示</span>
      <Segmented
        label="在庫の表示"
        value={mode}
        onChange={onChange}
        options={[
          { value: "exact", label: "個数" },
          { value: "level", label: "段階" },
        ]}
      />
    </div>
  );
}

export function StockLegend() {
  const items = [
    { color: STOCK_COLORS.in_stock, label: "在庫あり" },
    { color: STOCK_COLORS.low, label: "残りわずか" },
    { color: STOCK_COLORS.out, label: "在庫なし" },
  ];
  return (
    <div className="flex items-center gap-3 rounded-full bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-md ring-1 ring-slate-900/5 backdrop-blur">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-full bg-slate-900/95 px-4 py-2.5 text-sm font-medium text-white shadow-xl"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
      {message}
    </div>
  );
}

export function DemoNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-slate-400 ${className}`}>
      デモ版です。店舗名、住所、商品名、JANコードはすべて架空のものです。
    </p>
  );
}
