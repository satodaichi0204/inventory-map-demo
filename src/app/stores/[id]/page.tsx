import { Suspense } from "react";
import StoreDetail from "@/components/StoreDetail";

export default function StorePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-gray-500">読み込み中…</p>}>
      <StoreDetail />
    </Suspense>
  );
}
