const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { validImportDraft } = require('../lib/import-draft.ts');
const now = Date.now();
const base = () => ({ file: new Blob(['audio'], { type: 'audio/wav' }), fileName: 'a.wav', method: 'SENTENCE', ruleValue: 2, savedAt: now });
test('draft validation keeps only recent safe supported settings', () => {
 assert.equal(validImportDraft(base(), now), true);
 for (const change of [{method:'PARAGRAPH'}, {method:'UNKNOWN'}, {ruleValue:4}, {ruleValue:1.5}, {savedAt:now-3600001}, {savedAt:now+1}, {file:new Blob([])}, {fileName:''}]) assert.equal(validImportDraft({...base(),...change}, now), false);
 assert.equal(validImportDraft({...base(),method:'DURATION',ruleValue:30}, now), true);
 assert.equal(validImportDraft({...base(),method:'TURNS',ruleValue:50}, now), true);
});
