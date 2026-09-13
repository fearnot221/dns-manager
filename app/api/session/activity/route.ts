import { auth } from "@/lib/auth/config";
import { requireActor } from "@/lib/auth/session";
import { touchIdleSession } from "@/lib/auth/idle-session";
import { assertSameOrigin } from "@/lib/api/security";
import { apiError, ApiError } from "@/lib/api/respond";

export async function GET() {
  try { await requireActor(); const session = await auth(); return Response.json({ expiresAt: session?.idleExpiresAt }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireActor();
    const session = await auth();
    if (!session?.idleSessionId) throw new ApiError("登入已逾時，請重新登入。", 401);
    const expiresAt = await touchIdleSession(session.idleSessionId);
    if (!expiresAt) throw new ApiError("登入已逾時，請重新登入。", 401);
    return Response.json({ expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
