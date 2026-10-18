import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { BackButton } from "@/components/not-found-client";
import { notFoundVariants } from "@/components/not-found/variants";

export const metadata: Metadata = { title: "找不到頁面" };

const variants = Object.entries(notFoundVariants);

export default async function NotFound() {
  await connection();
  const [name, Visual] = variants[Math.floor(Math.random() * variants.length)];
  return <main className={`nx-page nx-${name}`}>
    <div className="nx-shell">
      <div className="login-brand nx-brand"><Brand /></div>
      <Visual />
      <h1 className="nx-title"><span className="sr-only">404 · </span>找不到這個頁面</h1>
      <div className="nx-actions">
        <Link className="button primary" href="/">回到首頁</Link>
        <BackButton />
      </div>
    </div>
  </main>;
}
