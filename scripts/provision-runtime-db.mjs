import { createHmac, randomUUID } from 'node:crypto';
import { mkdir,writeFile,rename,chown,chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
export function runtimeDatabaseUrl(adminUrl) {
  const url=new URL(adminUrl);
  if (!url.password) throw new Error('Bootstrap database password is required');
  const password=createHmac('sha256',decodeURIComponent(url.password)).update('dns-manager/runtime-role/v1').digest('hex');
  url.username='dns_app';url.password=password;
  return url;
}
export async function provisionRuntimeDatabase(adminUrl,file,owner=1000,group=owner) {
  const runtime=runtimeDatabaseUrl(adminUrl);
  const client=new PrismaClient({datasourceUrl:adminUrl,log:[]});
  try {
    await client.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('dns-runtime-provision',0))::text`;
      // Password is a generated hex string, role names and SQL identifiers are fixed.
      const existing=await tx.$queryRaw`SELECT rolname FROM pg_roles WHERE rolname='dns_app'`;
      if (!existing.length) await tx.$executeRawUnsafe('CREATE ROLE dns_app LOGIN');
      const memberships=await tx.$queryRaw`SELECT roleid FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='dns_app')`;
      if (memberships.length) throw new Error('Runtime role has unexpected inherited memberships');
      const owned=await tx.$queryRaw`SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname='dns_app')`;
      if (owned.length) throw new Error('Runtime role must not own migration-managed objects');
      await tx.$executeRawUnsafe(`ALTER ROLE dns_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${runtime.password}'`);
      await tx.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await tx.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO dns_app');
      await tx.$executeRawUnsafe('REVOKE ALL ON TABLE public._prisma_migrations FROM dns_app');
      const database=await tx.$queryRaw`SELECT current_database() AS name`;
      const quoted='"'+database[0].name.replaceAll('"','""')+'"';
      await tx.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${quoted} TO dns_app`);
      // Migrations retain their existing owner. Reconcile new tables on every deployment.
      await tx.$executeRawUnsafe(`DO $$ DECLARE t record; BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO dns_app', t.tablename);
        END LOOP;
      END $$`);
      await tx.$executeRawUnsafe('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO dns_app');
    });
    const directory=dirname(file);await mkdir(directory,{recursive:true,mode:0o700});
    const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,runtime.toString(),{mode:0o600});
    await chown(temporary,owner,group);await rename(temporary,file);
    // Root owns the provision-only directory; web can traverse but cannot list/write it.
    await chmod(directory,0o711);
  } finally {await client.$disconnect();}
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await provisionRuntimeDatabase(process.env.DATABASE_URL,process.env.RUNTIME_DATABASE_URL_FILE,1000);}
  catch {console.error('Runtime DB provisioning failed; inspect role/volume configuration without logging secrets');process.exitCode=1;}
}
