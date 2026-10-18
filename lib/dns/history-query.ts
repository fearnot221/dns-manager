import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { recordMatchesPattern } from "@/lib/auth/permissions";
import type { Actor } from "./types";
import { DNS_HISTORY_ACTIONS, dnsHistoryEvents, ownershipLabels, type HistorySource } from "./history";

const ownershipActions = ["UPDATE_DNS_OWNERSHIP", "ASSIGN_DNS_UNIT", "INSPECT_DNS_RECORD"];
function snapshot(value: Prisma.Sql) {
  return Prisma.sql`CASE WHEN jsonb_typeof(${value}->'name') = 'string'
    AND jsonb_typeof(${value}->'type') = 'string' AND jsonb_typeof(${value}->'ttl') = 'number'
    AND jsonb_typeof(${value}->'records') = 'array' THEN ${value} END`;
}

/** Expand old whole-zone deletions before filtering/counting, just like dnsHistoryEvents. */
export function historySourcesSql(zone: string, scope: string, onlyUnsynced = false) {
  return Prisma.sql`WITH source AS (
    SELECT a.* FROM "AuditLog" a WHERE a."zone" = ${zone} AND a."success"
      AND a."action" IN (${Prisma.join(DNS_HISTORY_ACTIONS)})
      AND (a."dnsScope" = ${scope} OR a."dnsScope" IS NULL)
      ${onlyUnsynced ? Prisma.sql`AND a."action" NOT IN (${Prisma.join(ownershipActions)})
        AND (a."action" = 'DELETE_ZONE' OR NOT EXISTS (
          SELECT 1 FROM "AuditLog" b WHERE b."zone" = a."zone" AND b."action" = 'SYNC_RECORD' AND b."success"
            AND b."dnsScope" IS NOT DISTINCT FROM a."dnsScope"
            AND b."recordName" = a."recordName" AND b."recordType" = a."recordType"
        ))` : Prisma.empty}
  ), expanded AS (
    SELECT "id", "createdAt", "zone", "recordName", "recordType", "action", "oldValue", "newValue", "userEmail", "userId", "dnsScope"
      FROM source WHERE "action" <> 'DELETE_ZONE'
    UNION ALL
    SELECT s."id" || ':' || (r->>'name') || ':' || (r->>'type'), s."createdAt", s."zone", r->>'name', r->>'type',
      'DELETE_RECORD', r, NULL::jsonb, s."userEmail", s."userId", s."dnsScope"
      FROM source s CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s."oldValue"->'rrsets') = 'array' THEN s."oldValue"->'rrsets' ELSE '[]'::jsonb END) r
      WHERE s."action" = 'DELETE_ZONE'
  ), parsed AS (
    SELECT e.*, ${snapshot(Prisma.sql`e."oldValue"`)} AS before,
      ${snapshot(Prisma.sql`CASE WHEN e."action" = 'APPLY_UNIT_DNS_REQUEST' THEN e."newValue"->'rrset' ELSE e."newValue" END`)} AS after,
      e."action" IN (${Prisma.join(ownershipActions)}) AS ownership FROM expanded e
  ), events AS (
    SELECT p.*, TRUE AS success,
      CASE WHEN ownership THEN "recordName" ELSE COALESCE(after->>'name', before->>'name') END AS name,
      CASE WHEN ownership THEN "recordType" ELSE COALESCE(after->>'type', before->>'type') END AS type
    FROM parsed p WHERE (NOT ownership AND (before IS NOT NULL OR after IS NOT NULL)) OR
      (ownership AND "recordName" <> '' AND "recordType" <> '' AND EXISTS (
        SELECT 1 FROM (VALUES ("oldValue"), ("newValue")) s(data)
        CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END) v
        WHERE v.key IN (${Prisma.join(Object.keys(ownershipLabels))}) AND jsonb_typeof(v.value) IN ('string', 'null')
      ))
  )`;
}

function accessSql(actor: Actor, zone: string) {
  if (actor.globalRole === "ADMIN" || actor.globalRole === "SUPER_ADMIN") return Prisma.sql`TRUE`;
  if (!actor.zoneGrants) return Prisma.sql`${actor.zoneRoles[zone] === "ADMIN"}`;
  const grants = actor.zoneGrants.filter(g => g.role === "ADMIN" && g.zoneName.toLowerCase().replace(/\.+$/, "") === zone.slice(0, -1)).flatMap(g => {
    const pattern = g.resourcePattern?.trim().toLowerCase().replace(/\.+$/, "") ?? null;
    if (!recordMatchesPattern(pattern?.startsWith("*.") ? `test.${pattern.slice(2)}` : pattern ?? zone, zone, g.resourcePattern)) return [];
    const name = pattern?.startsWith("*.") ? Prisma.sql`right(lower(name), length(${'.' + pattern.slice(2) + '.'})) = ${'.' + pattern.slice(2) + '.'}`
      : pattern ? Prisma.sql`lower(name) = ${pattern + '.'}` : Prisma.sql`TRUE`;
    return [Prisma.sql`(${name} AND ${g.allowedRecordTypes?.length ? Prisma.sql`type IN (${Prisma.join(g.allowedRecordTypes)})` : Prisma.sql`TRUE`})`];
  });
  // Match the same inside-zone boundary as recordMatchesPattern, including unrestricted grants.
  return Prisma.sql`(lower(name) = ${zone} OR right(lower(name), length(${'.' + zone})) = ${'.' + zone}) AND (${grants.length ? Prisma.join(grants, " OR ") : Prisma.sql`FALSE`})`;
}

export async function queryDnsHistory(actor: Actor, zone: string, scope: string, query: { name: string; type: string; q: string; page: number }) {
  const search = query.q.toLowerCase();
  const filter = Prisma.sql`${accessSql(actor, zone)} AND (${query.name} = '' OR name = ${query.name})
    AND (${query.type} = '' OR type = ${query.type}) AND (${search} = '' OR EXISTS (
      SELECT 1 FROM (
        SELECT name AS value UNION ALL SELECT type
        UNION ALL SELECT r->>'content' FROM jsonb_array_elements(COALESCE(before->'records', '[]'::jsonb) || COALESCE(after->'records', '[]'::jsonb)) r WHERE NOT ownership AND jsonb_typeof(r->'content') = 'string'
        UNION ALL SELECT v.value #>> '{}' FROM (VALUES ("oldValue"), ("newValue")) s(data)
          CROSS JOIN LATERAL jsonb_each(CASE WHEN ownership AND jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END) v
          WHERE v.key IN (${Prisma.join(Object.keys(ownershipLabels))}) AND jsonb_typeof(v.value) = 'string'
      ) searchable WHERE strpos(lower(value), ${search}) > 0
    ))`;
  const cte = historySourcesSql(zone, scope);
  const [counts, sources] = await db.$transaction([
    db.$queryRaw<{ total: bigint }[]>(Prisma.sql`${cte} SELECT count(*) AS total FROM events WHERE ${filter}`),
    db.$queryRaw<HistorySource[]>(Prisma.sql`${cte}
      SELECT e."id", e."createdAt", e."zone", e."recordName", e."recordType", e."action", e."oldValue", e."newValue",
        e."userEmail", e."dnsScope", e.success, u."name" AS "userName"
      FROM (SELECT * FROM events WHERE ${filter}
        ORDER BY "createdAt" DESC, ("action" = 'SYNC_RECORD') ASC, "id" DESC LIMIT 50 OFFSET ${(query.page - 1) * 50}) e
      LEFT JOIN "User" u ON u."id" = e."userId"
      ORDER BY e."createdAt" DESC, (e."action" = 'SYNC_RECORD') ASC, e."id" DESC`),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { events: sources.flatMap(dnsHistoryEvents), total: Number(counts[0].total) };
}
