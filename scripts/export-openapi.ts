import { writeFile } from "node:fs/promises";
import { openApiDocument } from "../lib/openapi/document";

async function main() {
  await writeFile(new URL("../docs/openapi.json", import.meta.url), JSON.stringify(openApiDocument, null, 2) + "\n");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
