import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual seek helper without requiring a browser or a React renderer.
const source = fs.readFileSync(new URL('../views/PlayerView.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('PlayerView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = tree.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(tree) === 'getSeekState'));
const compiled = ts.transpileModule(declaration.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const seek = context.exports.getSeekState;
const segments = [{ startTime: 0, endTime: 10 }, { startTime: 10, endTime: 20 }];

test('seeking clamps to audio bounds', () => {
  assert.equal(seek(-15, 20, segments).nextTime, 0);
  assert.equal(seek(35, 20, segments).nextTime, 20);
});
test('seeking updates the segment at an exact boundary', () => {
  assert.equal(seek(10, 20, segments).activeIndex, 1);
  assert.equal(seek(9.9, 20, segments).activeIndex, 0);
});
test('explicit segment selection keeps intended loop target', () => {
  assert.equal(seek(10, 20, segments, 1).activeIndex, 1);
});
test('empty session is a safe zero-length seek', () => {
  const result = seek(10, 0, []);
  assert.equal(result.nextTime, 0);
  assert.equal(result.activeIndex, -1);
});

const loadHelper = (name, globals = {}) => {
  const declaration = tree.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(tree) === name));
  const compiled = ts.transpileModule(declaration.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, ...globals };
  vm.runInNewContext(compiled, context);
  return context.exports[name];
};

test('time-section placeholders are distinguished from real transcripts', () => {
  const isTimeSection = loadHelper('isTimeSection');
  assert.equal(isTimeSection('[Audio Section: 0m 0s]'), true);
  assert.equal(isTimeSection('  [Audio Section: 2m 30s]  '), true);
  assert.equal(isTimeSection('Listen to the rhythm of the words.'), false);
});

test('sample rhythm definition is available without network or keys', () => {
  const definition = loadHelper('getSampleDefinition');
  const entry = definition('sample-1', 'Rhythm');
  assert.equal(entry.translation, '节奏');
  assert.equal(entry.phonetic, '/ˈrɪðəm/');
  assert.match(entry.definition, /regular pattern/);
  assert.equal(definition('other-session', 'rhythm'), null);
});

test('dictionary requests abort after eight seconds and clean up the timer', async () => {
  let expire;
  let cleared = false;
  const request = loadHelper('fetchDictionaryJson', {
    AbortController,
    setTimeout: (callback, delay) => { assert.equal(delay, 8000); expire = callback; return 42; },
    clearTimeout: id => { assert.equal(id, 42); cleared = true; },
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  const pending = request('https://example.test/dictionary');
  expire();
  assert.equal(await pending, null);
  assert.equal(cleared, true);
});
