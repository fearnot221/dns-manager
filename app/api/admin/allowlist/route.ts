/** Retired: legacy membership data is ignored, never read or modified here. */
function retired() { return Response.json({ error: "登入白名單功能已移除。" }, { status: 410 }); }
export const GET = retired;
export const POST = retired;
export const DELETE = retired;
