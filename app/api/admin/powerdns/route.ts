/** Retired: never accept, test, expose or persist API credentials. */
function retired() {
  return Response.json({ error: "PowerDNS 連線僅能由伺服器環境變數設定。" }, { status: 410 });
}
export const GET = retired;
export const POST = retired;
export const PUT = retired;
