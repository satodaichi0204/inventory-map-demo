import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "スタッフ ログイン" };

export default function LoginPage() {
  return <LoginForm />;
}
