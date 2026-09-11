import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { apiError, ApiError } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/security";
import { PowerDNSClient } from "@/lib/powerdns/client";
import { encryptKey, readConnection, saveConnection, savedKeyFor, validateApiUrl } from "@/lib/powerdns/settings";
import { logAuditEvent } from "@/lib/audit/service";
const schema = z.object({ apiUrl: z.string().max(2000), serverId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), apiKey: z.string().max(4096).default("") }).strict();
async function admin() { const actor = await requireActor(); if (!isGlobalAdmin(actor)) throw new ApiError("僅管理員可管理 PowerDNS 連線。", 403); return actor; }
export async function GET() {
  try {
    await admin(); const connection = await readConnection();
    return Response.json({ apiUrl: connection?.apiUrl ?? process.env.PDNS_API_URL ?? "", serverId: connection?.serverId ?? process.env.PDNS_SERVER_ID ?? "localhost", hasApiKey: !!(connection?.encryptedKey || process.env.PDNS_API_KEY), updatedAt: connection?.updatedAt ?? null, updatedBy: connection?.updatedBy ?? null, demoMode: process.env.PDNS_MOCK === "true" });
  } catch (error) { return apiError(error); }
}
async function execute(request: Request, test: boolean) {
  try {
    assertSameOrigin(request); const actor = await admin();
    const input = schema.parse(await request.json()); const apiUrl = validateApiUrl(input.apiUrl);
    const apiKey = input.apiKey || await savedKeyFor(apiUrl, input.serverId);
    if (!apiKey) throw new ApiError("請填入 API 金鑰；更換主機或 Server ID 時必須重新輸入。", 400);
    if (test) {
      const zones = await new PowerDNSClient({ NODE_ENV: process.env.NODE_ENV, PDNS_API_URL: apiUrl, PDNS_API_KEY: apiKey, PDNS_SERVER_ID: input.serverId, PDNS_MOCK: "false" }).listZones();
      return Response.json({ message: `連線成功，可讀取 ${zones.length} 個網域。` });
    }
    await saveConnection({ apiUrl, serverId: input.serverId, encryptedKey: await encryptKey(apiKey), updatedAt: new Date().toISOString(), updatedBy: actor.email });
    await logAuditEvent({ actor, zone: "", action: "UPDATE_POWERDNS_CONNECTION", after: { apiUrl, serverId: input.serverId }, success: true, request });
    return Response.json({ message: "已儲存連線設定。" });
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request) { return execute(request, false); }
export async function POST(request: Request) { return execute(request, true); }
