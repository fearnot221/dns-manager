/** Retired: historical data is retained but never read or modified by this endpoint. */
function retired() { return Response.json({ error: "使用者訊息功能已移除。" }, { status: 410, headers: { "Cache-Control": "no-store" } }); }
export const GET = retired;
export const POST = retired;
export const PATCH = retired;
