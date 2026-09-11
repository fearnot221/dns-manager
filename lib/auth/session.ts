import "server-only";
import { auth } from "./config";
import { db } from "@/lib/db/client";
import { demoUsers } from "@/lib/users/demo";
import { resolvedGlobalRole } from "./owner";
import type { Actor } from "@/lib/dns/types";

export async function requireActor():Promise<Actor>{
  const session=await auth();
  if(!session?.user?.id||!session.user.email)throw new AuthError();
  if(process.env.NODE_ENV!=="production"&&!process.env.DATABASE_URL&&session.user.id.startsWith("dev-")){
    const user = await demoUsers((users) => users.find((item) => item.id === session.user.id));
    if (!user || user.disabled) throw new AuthError();
    return {id:user.id,email:user.email,name:user.name,globalRole:resolvedGlobalRole(user.email,user.globalRole),zoneRoles:{}};
  }
  const user=await db.user.findUnique({where:{id:session.user.id},include:{zonePermissions:{where:{OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}},groupMemberships:{include:{group:{include:{zonePermissions:{where:{OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}}}}}}});
  if(!user || user.disabled)throw new AuthError();
  const zoneRoles:Actor["zoneRoles"]={};
  for(const permission of [...user.zonePermissions,...user.groupMemberships.flatMap((m)=>m.group.zonePermissions)]){
    const current=zoneRoles[permission.zoneName]; const rank={VIEWER:1,EDITOR:2,ADMIN:3}; if(!current||rank[permission.role]>rank[current])zoneRoles[permission.zoneName]=permission.role;
  }
  return {id:user.id,email:user.email,name:user.name,globalRole:resolvedGlobalRole(user.email,user.globalRole),zoneRoles};
}

export class AuthError extends Error { readonly status=401; constructor(){super("Authentication required");this.name="AuthError";} }
