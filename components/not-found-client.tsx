"use client";

import { usePathname, useRouter } from "next/navigation";

export function QueryPath() {
  return <span className="nx-query">{usePathname()}</span>;
}

export function BackButton() {
  const router = useRouter();
  return <button type="button" className="button" onClick={() => router.back()}>返回上一頁</button>;
}
