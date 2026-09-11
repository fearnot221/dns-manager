import { db } from "@/lib/db/client";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (process.env.DATABASE_URL) await db.$queryRaw`SELECT 1`;
    else if (process.env.NODE_ENV === "production") throw new Error("Database unavailable");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
