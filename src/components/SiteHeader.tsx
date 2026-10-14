"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const NAV = [
  { href: "/", label: "地図で探す", match: (p: string) => p === "/" || p.startsWith("/stores") },
  { href: "/staff", label: "スタッフ", match: (p: string) => p.startsWith("/staff") },
  { href: "/demo/barcodes", label: "デモ用バーコード", match: (p: string) => p.startsWith("/demo") },
];

export default function SiteHeader() {
  return (
    <header className="z-30 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-600/30">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
              <path d="M12 2a7.5 7.5 0 0 0-7.5 7.5c0 5.4 6.6 11.7 6.9 12a.9.9 0 0 0 1.2 0c.3-.3 6.9-6.6 6.9-12A7.5 7.5 0 0 0 12 2Zm0 10.3a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z" />
            </svg>
          </span>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">在庫マップ</span>
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-800">
            DEMO
          </span>
        </Link>
        <Suspense fallback={<NavLinks pathname="" />}>
          <ActiveNav />
        </Suspense>
      </div>
    </header>
  );
}

function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            } ${item.href === "/demo/barcodes" ? "hidden sm:block" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
