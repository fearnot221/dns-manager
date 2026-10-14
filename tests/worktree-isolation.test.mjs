import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('excludes nested agent checkouts from test discovery, lint, typecheck and Docker context', async () => {
  const directory = resolve('.claude/worktrees', `isolation-regression-${randomUUID()}`);
  const file = resolve(directory, 'sentinel.test.ts');
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(file, 'throw new Error("Nested checkout must not run");\n');
    const files = execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly'], { encoding: 'utf8', timeout: 20000 });
    expect(files).toContain('tests/worktree-isolation.test.mjs');
    expect(files).not.toContain('sentinel.test.ts');
    const eslint = new ESLint();
    for (const directory of ['.claude', '.codex', '.worktrees', 'worktrees']) {
      expect(await eslint.isPathIgnored(resolve(directory, 'nested/test.ts'))).toBe(true);
    }
    const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
    expect(ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).fileNames).not.toContain(file);
    const ignore = (await readFile('.dockerignore', 'utf8')).split(/\r?\n/);
    for (const directory of ['.claude', '.codex', '.worktrees', 'worktrees']) expect(ignore).toContain(`**/${directory}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);
