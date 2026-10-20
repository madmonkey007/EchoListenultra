const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { fileImportError, durationImportError } = require('../lib/import-limits.ts');
test('browser import size is bounded and nonempty', () => {
  for (const size of [0, -1, NaN, Infinity, 100 * 1024 * 1024 + 1]) assert.ok(fileImportError(size));
  assert.equal(fileImportError(100 * 1024 * 1024), '');
});
test('duration must be finite positive and no longer than two hours', () => {
  for (const value of [0, -1, NaN, Infinity, 7201]) assert.ok(durationImportError(value));
  assert.equal(durationImportError(7200), '');
});
