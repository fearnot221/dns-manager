// Next's ESLint plugin loads this adapter synchronously through CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { globSync } = require('tinyglobby');

// Only the API used by @next/eslint-plugin-next 16.3.8 is supported.
// fast-glob matches directory patterns themselves, without expanding descendants.
exports.globSync = (pattern, options) => globSync(pattern, {
  ...options,
  expandDirectories: false,
});
