import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimePort } from '../scripts/runtime-port.mjs';
test('hosting PORT is respected in both production and development', () => {
  for (const NODE_ENV of ['production', 'development']) {
    for (const PORT of ['20010', '20011', '3198']) assert.equal(runtimePort({NODE_ENV, PORT}), PORT);
  }
});
test('only a local invocation may fall back; production requires its assigned port', () => {
  assert.equal(runtimePort({NODE_ENV:'development'}), '3100');
  assert.throws(() => runtimePort({NODE_ENV:'production'}), /must be supplied/);
});
test('invalid assigned ports fail instead of silently binding a fixed fallback', () => {
  for (const PORT of ['', 'garbage', '0', '65536', '3000garbage', '1.5']) {
    assert.throws(() => runtimePort({NODE_ENV:'production', PORT}), /integer/);
  }
});
