/** DNS change history and restoration have been retired. */
export async function POST() {
  return Response.json({ error: "DNS 變更紀錄功能已移除。" }, { status: 410 });
}
