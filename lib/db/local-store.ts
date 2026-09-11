import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const isLocalDemo = () => process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
const state = globalThis as unknown as { localStoreQueue?: Promise<unknown> };

/** Local demo only: serialized writes and atomic rename, never browser storage. */
export async function localDocument<T, R>(name: string, initial: () => Promise<T>, operation: (data: T) => R | Promise<R>, write = false): Promise<R> {
  if (!isLocalDemo() || !/^[a-z-]+$/.test(name)) throw new Error("Local store is unavailable");
  const run = (state.localStoreQueue ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const directory = path.join(process.cwd(), ".local-demo");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = path.join(directory, `${name}.json`);
    let data: T;
    let created = false;
    try { data = JSON.parse(await readFile(filename, "utf8")) as T; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      data = await initial(); created = true;
    }
    const result = await operation(data);
    if (write || created) {
      const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, filename);
    }
    return result;
  });
  state.localStoreQueue = run;
  return run;
}
