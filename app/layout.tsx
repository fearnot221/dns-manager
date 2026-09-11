import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "NCUEECESNMG DNS Manager", template: "%s · NCUEECESNMG DNS Manager" },
  applicationName: "NCUEECESNMG DNS Manager",
  icons: { icon: { url: "/ncu-emblem.png", type: "image/png", sizes: "200x200" } },
  description: "NCUEECESNMG DNS 紀錄申請、審核與管理平台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant" suppressHydrationWarning><body className={`${geist.variable} ${mono.variable}`}><Providers>{children}</Providers></body></html>;
}
