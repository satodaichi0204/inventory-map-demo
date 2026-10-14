import type { Metadata } from "next";
import BarcodeSheet from "@/components/BarcodeSheet";

export const metadata: Metadata = { title: "デモ用バーコード" };

export default function BarcodesPage() {
  return <BarcodeSheet />;
}
