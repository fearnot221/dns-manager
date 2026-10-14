# Development dependency security

The lockfile updates `brace-expansion` to patched releases 1.1.21 and 5.0.12.
The remaining high findings came from one chain:
`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`.

As of 2026-10-15, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no patched `braces` release. Next's plugin 16.3.8 uses only
`globSync(pattern, { onlyDirectories: true })` in `get-root-dirs.js`.
The package override replaces **only that plugin version's** `fast-glob` dependency
with the local `tooling/next-eslint-glob` adapter backed by published
[tinyglobby 0.2.17](https://github.com/SuperchupuDev/tinyglobby), without `braces`
or `micromatch`. The adapter disables `expandDirectories` to preserve fast-glob's
literal-directory behavior. It does not rename or hide a vulnerable package.
Docker copies this local dependency before `npm ci`, as required by the lockfile.

All Next/React lint rules and runtime dependency versions remain unchanged.
`tests/eslint-toolchain.test.mjs` exercises root discovery and real lint diagnostics,
including directory-only matching, relative/absolute paths, arrays, braces,
extglobs and Windows separators. This is a targeted compatibility substitution,
not a claim that tinyglobby implements every fast-glob API.

When upgrading the Next ESLint plugin, inspect its glob call sites again. Prefer
removing the override once upstream no longer depends on vulnerable packages;
otherwise revalidate compatibility before changing the version-scoped override.
Verify now runs `npm audit --audit-level=high` for both production and development
dependencies, so new high/critical advisories fail the required CI check.
