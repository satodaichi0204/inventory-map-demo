import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "在庫マップ（デモ）",
    template: "%s｜在庫マップ（デモ）",
  },
  description: "地図から、商品の在庫がある近くの店舗を探せるサービスのデモ版です。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex h-full flex-col font-sans">
        <header className="shrink-0 bg-blue-700 text-white">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <Link href="/" className="font-bold">
              在庫マップ<span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs font-medium">デモ</span>
            </Link>
            <nav className="flex gap-3 text-sm">
              <Link href="/staff" className="hover:underline">
                スタッフ
              </Link>
              <Link href="/demo/barcodes" className="hover:underline">
                デモ用バーコード
              </Link>
            </nav>
          </div>
        </header>
        {!supabaseConfigured && (
          <p className="bg-red-600 px-3 py-2 text-sm text-white">
            Supabase の接続情報が設定されていません。.env.local（Vercel では環境変数）に NEXT_PUBLIC_SUPABASE_URL と
            NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。
          </p>
        )}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
        <footer className="shrink-0 border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500">
          デモ版です。店舗名、住所、商品名、JANコードはすべて架空のものです。
        </footer>
      </body>
    </html>
  );
}
