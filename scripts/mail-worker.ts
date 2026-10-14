import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

async function main() {
  if (process.env.RUNTIME_DATABASE_URL_FILE) process.env.DATABASE_URL = (await readFile(process.env.RUNTIME_DATABASE_URL_FILE, "utf8")).trim();
  if (!process.env.DATABASE_URL) throw new Error("Database configuration required");
  const { processOneDelivery } = await import("../lib/mail/worker");
  const { db } = await import("../lib/db/client");
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  try {
    while (!stopping) {
      try {
        const worked = await processOneDelivery();
        await writeFile("/tmp/mail-worker-heartbeat", String(Date.now()));
        if (!worked) await sleep(5000);
      } catch { console.error("MAIL_WORKER_CYCLE_FAILED: check database and mail settings"); await sleep(10000); }
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("MAIL_WORKER_START_FAILED"); process.exitCode = 1; });
