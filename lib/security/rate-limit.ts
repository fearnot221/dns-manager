import "server-only";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";

export type Budget = { key:string; limit:number; windowMs:number };
type Counter = { count:number; expiresAt:number };
/** Count before the expensive operation. Fixed windows, atomic across all app replicas. */
export async function consumeBudgets(budgets:Budget[], tx?:Prisma.TransactionClient):Promise<boolean> {
  const now=Date.now();
  if (isLocalDemo()) return localDocument("security-rate-limits",async()=>({ counters:{} as Record<string,Counter> }),data=>{
    for (const [key,value] of Object.entries(data.counters)) if (value.expiresAt<=now) delete data.counters[key];
    let allowed=true;
    for (const budget of budgets) {
      const previous=data.counters[budget.key];
      const counter=previous ?? {count:0,expiresAt:now+budget.windowMs};
      counter.count=Math.min(counter.count+1,budget.limit+1);data.counters[budget.key]=counter;
      if (counter.count>budget.limit) allowed=false;
    }
    return allowed;
  },true);
  const consume=async(client:Prisma.TransactionClient)=>{
    await client.$executeRaw`DELETE FROM "SecurityRateLimit" WHERE "expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')`;
    let allowed=true;
    // Same ordering on every caller prevents multi-key deadlocks.
    for (const budget of [...budgets].sort((a,b)=>a.key.localeCompare(b.key))) {
      const rows=await client.$queryRaw<{count:number}[]>`
        INSERT INTO "SecurityRateLimit" ("key","count","expiresAt") VALUES (${budget.key},1,(clock_timestamp() AT TIME ZONE 'UTC') + ${budget.windowMs} * INTERVAL '1 millisecond')
        ON CONFLICT ("key") DO UPDATE SET
          "count"=CASE WHEN "SecurityRateLimit"."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') THEN 1 ELSE LEAST("SecurityRateLimit"."count"+1,${budget.limit+1}) END,
          "expiresAt"=CASE WHEN "SecurityRateLimit"."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') THEN EXCLUDED."expiresAt" ELSE "SecurityRateLimit"."expiresAt" END
        RETURNING "count"`;
      if (rows[0].count>budget.limit) allowed=false;
    }
    return allowed;
  };
  return tx ? consume(tx) : db.$transaction(consume);
}
export function privateBudgetKey(namespace:string,identifier:string):string {
  const secret=process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.NODE_ENV==="production") throw new Error("Missing rate-limit secret");
  return `${namespace}:${createHmac("sha256",secret??"local-demo-only").update(identifier).digest("hex")}`;
}
export async function allowPasswordAttempt(email:string):Promise<boolean> {
  if (!await consumeBudgets([{key:"password-login:global",limit:300,windowMs:60_000}])) return false;
  return consumeBudgets([{key:privateBudgetKey("password-login:account",email),limit:10,windowMs:15*60_000}]);
}
