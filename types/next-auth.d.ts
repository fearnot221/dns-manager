import "next-auth";
import "next-auth/jwt";
declare module "next-auth" {
  interface User { globalRole?: "USER"|"ADMIN"|"SUPER_ADMIN" }
  interface Session { loginProvider?: string; user:{ id:string; email:string; name?:string|null; image?:string|null; globalRole:"USER"|"ADMIN"|"SUPER_ADMIN" } }
}
declare module "next-auth/jwt" { interface JWT { portalEmail?:string; loginProvider?:string; userId?:string; globalRole?:"USER"|"ADMIN"|"SUPER_ADMIN" } }
