import type { Metadata, Viewport } from "next";
import SiteHeader from "@/components/SiteHeader";
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
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex h-full flex-col bg-slate-50 font-sans text-slate-900">
        <SiteHeader />
        {!supabaseConfigured && (
          <p className="bg-red-600 px-4 py-2 text-sm text-white">
            Supabase の接続情報が設定されていません。.env.local（Vercel では環境変数）に NEXT_PUBLIC_SUPABASE_URL と
            NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。
          </p>
        )}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
