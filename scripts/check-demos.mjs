// Runs every demo through the driver on real mnns and checks each gives steps to show.
//   MNNS_DIR=../mnns S2A2_DIR=../S2A2 node scripts/check-demos.mjs [--write]
// --write saves the traces to demos/recorded.json, which the app shows when it can't run
// mnns itself (opened outside LucianOS, or on a phone away from the computer).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ALGORITHMS, request } from '../lib/algorithms.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const mnns = process.env.MNNS_DIR ?? '../mnns';
const s2a2 = process.env.S2A2_DIR ?? '';
const recorded = { made: new Date().toISOString().slice(0, 10), traces: {} };
let bad = 0;
for (const a of ALGORITHMS) {
  for (const d of a.demos) {
    const req = request(a.id, d.input);
    const r = spawnSync('swipl', ['-q', '-g', 'mnnaction_main', '-s', here('../prolog/mnnaction.pl'), '--', mnns, s2a2], { input: JSON.stringify(req) + '\n', encoding: 'utf8', timeout: 120000 });
    const line = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
    let reply;
    try { reply = JSON.parse(line); } catch { reply = { ok: false, error: `not JSON: ${line.slice(0, 300)} ${(r.stderr ?? '').slice(0, 600)}` }; }
    const atOk = reply.ok && reply.steps.every((s) => a.pseudocode.some(([id]) => id === s.at));
    const fine = reply.ok && reply.steps.length > 0 && atOk;
    if (!fine) bad++;
    console.log(`${fine ? 'ok  ' : 'FAIL'} ${a.id} / ${d.name}: ${reply.ok ? `${reply.steps.length} steps${atOk ? '' : ' (a step names a line not in the pseudocode)'}` : reply.error}`);
    if (!fine && r.stderr) console.log(r.stderr.split('\n').slice(0, 12).map((l) => `     ${l}`).join('\n'));
    recorded.traces[`${a.id}/${d.name}`] = reply;
  }
}
if (process.argv.includes('--write')) fs.writeFileSync(here('../demos/recorded.json'), JSON.stringify(recorded, null, 1) + '\n');
// (written synchronously and compressed: a long line logged just before exit can be cut off)
if (process.env.PRINT_RECORDED) fs.writeSync(1, `RECORDED-BEGIN ${zlib.gzipSync(JSON.stringify(recorded)).toString('base64')} RECORDED-END\n`);
console.log(bad ? `${bad} demo(s) failed` : 'Every demo ran on real mnns.');
process.exit(bad ? 1 : 0);
