// The 200 inputs and outputs in io/ are run again: a change in behaviour shows up here.
// Most run the driver on real mnns and S2A2, so this needs swipl and MNNS_DIR and S2A2_DIR
// (or ../mnns and ../S2A2); without swipl it is skipped. If a change is meant, run
// `npm run ios` to write the new outputs, and check the diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeIos, toText } from '../io/engine.mjs';
import { cases, title } from '../io/cases.mjs';

const read = (f) => fs.readFileSync(fileURLToPath(new URL(`../io/${f}`, import.meta.url)), 'utf8');
const swipl = !spawnSync('swipl', ['--version']).error;

test('the 200 recorded inputs give the same outputs', { skip: swipl ? false : 'no swipl here' }, async () => {
  const saved = read('ios.jsonl').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(saved.length, 200);
  const now = await makeIos(cases);
  for (let i = 0; i < saved.length; i++) assert.deepEqual(now[i], saved[i], `example ${i + 1} (${saved[i].name}) changed`);
  assert.equal(read('ios.txt'), toText(now, title));
});
