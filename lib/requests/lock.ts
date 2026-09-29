import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isDevRequestStore } from "./dev-store";
const localLocks=new Map<string,Promise<unknown>>();
/** Both decisions share this lock, and must re-read PENDING after acquiring it. */
export async function withDnsRequestLock<T>(id:string,action:(tx?:Prisma.TransactionClient)=>Promise<T>):Promise<T> {
  if (!isDevRequestStore()) return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "DnsRecordRequest" WHERE "id" = ${id} FOR UPDATE`;
    return action(tx);
  },{timeout:60000});
  const previous=localLocks.get(id)??Promise.resolve();
  const operation=previous.catch(()=>undefined).then(()=>action());localLocks.set(id,operation);
  try {return await operation;} finally {if(localLocks.get(id)===operation)localLocks.delete(id);}
}
