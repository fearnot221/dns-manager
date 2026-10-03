import { headers } from "next/headers";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "NCUEECESNMG DNS Manager", template: "%s · NCUEECESNMG DNS Manager" },
  applicationName: "NCUEECESNMG DNS Manager",
  icons: { icon: { url: "/ncu-emblem.png", type: "image/png", sizes: "200x200" } },
  description: "NCUEECESNMG DNS 紀錄申請、審核與管理平台。",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce=(await headers()).get("x-nonce") ?? undefined;
  return <html lang="zh-Hant" suppressHydrationWarning><body className={mono.variable}><Providers nonce={nonce}>{children}</Providers></body></html>;
}
