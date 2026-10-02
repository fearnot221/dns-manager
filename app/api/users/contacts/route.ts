import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/respond";

export async function GET() {
  try {
    const actor = await requireActor();
    const users = process.env.DATABASE_URL ? await db.user.findMany({
      where: { removedAt: null, email: { startsWith: "contact-", endsWith: "@accounts.invalid" }, ...(isGlobalAdmin(actor) ? {} : { unitMemberships: { some: { unit: { members: { some: { userId: actor.id } } } } } }) },
      select: { id: true, name: true, portalEmail: true, unitMemberships: { select: { unit: { select: { name: true } } } } }, orderBy: { name: "asc" },
    }) : [];
    return Response.json({ contacts: users.map((user) => ({ id: user.id, name: user.name || "", email: user.portalEmail || "", units: user.unitMemberships.map((membership) => membership.unit.name) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
