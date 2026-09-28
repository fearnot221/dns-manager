import "server-only";
import { db } from "@/lib/db/client";
import type { Actor } from "@/lib/dns/types";

/** Actual memberships only: global oversight does not create a unit workspace. */
export async function memberWorkspaces(actor: Actor) {
  if (!process.env.DATABASE_URL) return [];
  const memberships = await db.unitMember.findMany({
    where: { userId: actor.id },
    select: { role: true, unit: { select: { id: true, name: true, status: true } } },
    orderBy: { unit: { name: "asc" } },
  });
  return memberships.map(({ role, unit }) => ({ ...unit, role }));
}
