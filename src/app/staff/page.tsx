import type { Metadata } from "next";
import StaffConsole from "@/components/StaffConsole";

export const metadata: Metadata = { title: "在庫の更新（スタッフ）" };

export default function StaffPage() {
  return <StaffConsole />;
}
