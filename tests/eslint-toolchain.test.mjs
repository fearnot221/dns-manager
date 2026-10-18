import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import next from '@next/eslint-plugin-next';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// Both project-config checks share its parser/plugins instead of loading them in two workers.
const projectESLint = new ESLint();
const { getRootDirs } = require('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
const fixture = mkdtempSync(join(tmpdir(), 'dns-eslint-roots-'));
const packages = join(fixture, 'packages');
for (const name of ['alpha', 'beta', '.hidden']) {
  mkdirSync(join(packages, name, 'app'), { recursive: true });
  writeFileSync(join(packages, name, 'app/page.tsx'), 'export default function Page() { return null; }');
}
writeFileSync(join(packages, 'not-a-directory'), '');
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function roots(rootDir) {
  return getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir } } })
    .map((path) => resolve(path)).sort();
}

describe('Next ESLint glob replacement compatibility', () => {
  it('retains the default project root', () => {
    expect(roots(undefined)).toEqual([process.cwd()]);
  });

  it.each([
    ['absolute glob', `${packages}/*`],
    ['relative glob', `${relative(process.cwd(), packages)}/*`],
    ['trailing slash', `${packages}/*/`],
    ['brace alternatives', `${packages}/{alpha,beta}`],
    ['extglob alternatives', `${packages}/@(alpha|beta)`],
    ['Windows separators', `${packages}/*`.replaceAll('/', '\\')],
    ['array of literal and glob roots', [join(packages, 'alpha'), `${packages}/bet*`]],
  ])('finds only visible directories with %s', (_label, pattern) => {
    expect(roots(pattern)).toEqual(['alpha', 'beta'].map((name) => join(packages, name)));
  });

  it('handles literal roots and missing roots', () => {
    expect(roots(join(packages, 'alpha'))).toEqual([join(packages, 'alpha')]);
    expect(roots(`${packages}/missing*`)).toEqual([]);
  });

  it('still reports internal anchors for a custom glob root and permits external links', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['**/*.jsx'],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { '@next/next': next },
        settings: { next: { rootDir: `${packages}/{alpha,beta}` } },
        rules: { '@next/next/no-html-link-for-pages': 'error' },
      }],
    });
    const [result] = await eslint.lintText(
      'const links = <><a href="/">Home</a><a href="https://example.com">External</a></>;',
      { filePath: 'toolchain-fixture.jsx' },
    );
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].ruleId).toBe('@next/next/no-html-link-for-pages');
  });

  it('excludes nested agent checkouts from test discovery, lint, typecheck and Docker context', async () => {
    const directory = resolve('.claude/worktrees', `isolation-regression-${randomUUID()}`);
    const file = resolve(directory, 'sentinel.test.ts');
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(file, 'throw new Error("Nested checkout must not run");\n');
      const files = execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly'], { encoding: 'utf8', timeout: 20000 });
      expect(files).toContain('tests/eslint-toolchain.test.mjs');
      expect(files).not.toContain('sentinel.test.ts');
      for (const directory of ['.claude', '.codex', '.worktrees', 'worktrees']) {
        expect(await projectESLint.isPathIgnored(resolve(directory, 'nested/test.ts'))).toBe(true);
      }
      const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
      expect(ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).fileNames).not.toContain(file);
      const ignore = (await readFile('.dockerignore', 'utf8')).split(/\r?\n/);
      for (const directory of ['.claude', '.codex', '.worktrees', 'worktrees']) expect(ignore).toContain(`**/${directory}`);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30000);

  it('keeps the existing project Next.js rules active for TSX', async () => {
    const [result] = await projectESLint.lintText(
      'export default function Example() { return <script src="/legacy.js" />; }',
      { filePath: 'src/app/toolchain-fixture.tsx' },
    );
    expect(result.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: '@next/next/no-sync-scripts', severity: 2 }),
    ]));
  });
});
