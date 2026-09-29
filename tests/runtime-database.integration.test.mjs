import { afterAll,describe,expect,it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtemp,readFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provisionRuntimeDatabase,runtimeDatabaseUrl } from '../scripts/provision-runtime-db.mjs';
const url=process.env.UNIT_TEST_DATABASE_URL;
describe.skipIf(!url)('least-privilege database provisioning in a disposable database',()=>{
 let client;
 afterAll(async()=>{if(client)await client.$disconnect();});
 it('is repeatable, keeps migration ownership, and grants runtime CRUD without DDL privileges',async()=>{
  const target=new URL(url);if(!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!='/dns_units_test')throw Error('Use isolated DB only');
  if(!target.password)target.password='public-fixture-password-only';
  const directory=await mkdtemp(join(tmpdir(),'dns-db-role-test-'));const file=join(directory,'secret','database-url');
  try{
   await provisionRuntimeDatabase(target.toString(),file,process.getuid(),process.getgid());
   await provisionRuntimeDatabase(target.toString(),file,process.getuid(),process.getgid());
   const runtime=runtimeDatabaseUrl(target.toString());expect(runtime.password).not.toBe(target.password);
   expect(await readFile(file,'utf8')).toBe(runtime.toString());expect((await stat(file)).mode & 0o777).toBe(0o600);
   client=new PrismaClient({datasourceUrl:runtime.toString(),log:[]});
   const flags=await client.$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolreplication FROM pg_roles WHERE rolname=current_user`;
   expect(Object.values(flags[0]).every(value=>value===false)).toBe(true);
   const grants=await client.$queryRaw`SELECT has_schema_privilege(current_user,'public','CREATE') AS create_schema,has_table_privilege(current_user,'public."User"','SELECT,INSERT,UPDATE,DELETE') AS crud,has_table_privilege(current_user,'public._prisma_migrations','UPDATE') AS migration_write`;
   expect(grants[0]).toEqual({create_schema:false,crud:true,migration_write:false});
   // Non-destructive representative CRUD plus session/limiter operations in a transaction.
   const email=crypto.randomUUID()+'@db-role-test.invalid';
   const user=await client.user.create({data:{email}});expect((await client.user.findUnique({where:{id:user.id}})).email).toBe(email);
   await client.user.update({where:{id:user.id},data:{note:'fixture'}});
   await client.session.create({data:{userId:user.id,sessionToken:crypto.randomUUID(),expires:new Date(Date.now()+60000)}});
   await client.securityRateLimit.create({data:{key:'runtime:'+crypto.randomUUID(),count:1,expiresAt:new Date(Date.now()+60000)}});
   const owner=await client.$queryRaw`SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='User'`;
   expect(owner[0].tableowner).not.toBe('dns_app');
  }finally{await rm(directory,{recursive:true,force:true});}
 });
});
