import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import next from '@next/eslint-plugin-next';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
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

  it('keeps the existing project Next.js rules active for TSX', async () => {
    const [result] = await new ESLint().lintText(
      'export default function Example() { return <script src="/legacy.js" />; }',
      { filePath: 'src/app/toolchain-fixture.tsx' },
    );
    expect(result.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: '@next/next/no-sync-scripts', severity: 2 }),
    ]));
  });
});
