import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { PowerDNSError } from "./errors";

export type SavedConnection = { apiUrl: string; serverId: string; encryptedKey: string; updatedAt: string; updatedBy: string };
export function validateApiUrl(value: string, env: NodeJS.ProcessEnv = process.env) {
  let url: URL;
  try { url = new URL(value); } catch { throw new PowerDNSError("API 網址格式不正確。", 400); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/api/v1") throw new PowerDNSError("請使用不含帳密或參數、以 /api/v1 結尾的 API 網址。", 400);
  const configured = (env.PDNS_ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (env.PDNS_API_URL) { try { configured.push(new URL(env.PDNS_API_URL).origin); } catch { /* Invalid env does not expand the allowlist. */ } }
  if (isLocalDemo()) configured.push("http://127.0.0.1:8081", "http://localhost:8081");
  if (!configured.includes(url.origin)) throw new PowerDNSError("此 API 主機尚未列入伺服器的 PDNS_ALLOWED_ORIGINS，請先由維運人員加入允許清單。", 400);
  return url.href.replace(/\/$/, "");
}
async function encryptionKey() {
  let key = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!key && isLocalDemo()) key = await localDocument("encryption-key", async () => ({ value: randomBytes(32).toString("hex") }), (data) => data.value);
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new PowerDNSError("請先設定 64 位十六進位 SETTINGS_ENCRYPTION_KEY，再儲存 API 金鑰。", 503);
  return Buffer.from(key, "hex");
}
export async function encryptKey(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
async function decryptKey(value: string) {
  try { const [iv, tag, payload] = value.split(".").map((part) => Buffer.from(part, "base64")); const decipher = createDecipheriv("aes-256-gcm", await encryptionKey(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8"); }
  catch { throw new PowerDNSError("無法解密 API 金鑰，請確認伺服器加密金鑰。", 503); }
}
export async function readConnection(): Promise<SavedConnection | null> {
  if (isLocalDemo()) return localDocument<{ connection: SavedConnection | null }, SavedConnection | null>("powerdns", async () => ({ connection: null }), (data) => data.connection);
  const setting = await db.systemSetting.findUnique({ where: { key: "powerdns" } });
  return setting?.value as SavedConnection | null ?? null;
}
export async function saveConnection(connection: SavedConnection) {
  if (isLocalDemo()) return localDocument("powerdns", async () => ({ connection: null as SavedConnection | null }), (data) => { data.connection = connection; }, true);
  await db.systemSetting.upsert({ where: { key: "powerdns" }, create: { key: "powerdns", value: connection }, update: { value: connection } });
}
export async function connectionEnvironment(): Promise<NodeJS.ProcessEnv> {
  // Local demo never switches its DNS data to a live server when settings are edited.
  if (process.env.PDNS_MOCK === "true") return process.env;
  const connection = await readConnection();
  if (!connection) return process.env;
  return { ...process.env, PDNS_API_URL: validateApiUrl(connection.apiUrl), PDNS_SERVER_ID: connection.serverId, PDNS_API_KEY: await decryptKey(connection.encryptedKey) };
}
export async function savedKeyFor(apiUrl: string, serverId: string) {
  const previous = await readConnection();
  if (previous?.apiUrl === apiUrl && previous.serverId === serverId) return decryptKey(previous.encryptedKey);
  if (!previous && apiUrl === process.env.PDNS_API_URL?.replace(/\/$/, "") && serverId === (process.env.PDNS_SERVER_ID || "localhost")) return process.env.PDNS_API_KEY || "";
  return "";
}
