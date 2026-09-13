import "server-only";
import { PowerDNSError } from "./errors";

export function validateApiUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new PowerDNSError("PDNS_API_URL 格式不正確。", 503); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/api/v1") {
    throw new PowerDNSError("PDNS_API_URL 必須以 /api/v1 結尾，不可包含帳密或參數。", 503);
  }
  return url.href.replace(/\/$/, "");
}

/** Environment is the sole source; ignore legacy database/local settings. */
export async function connectionEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (process.env.PDNS_MOCK === "true") return process.env;
  return { ...process.env, PDNS_API_URL: process.env.PDNS_API_URL ? validateApiUrl(process.env.PDNS_API_URL) : "" };
}
