#!/usr/bin/env node
// Veil 탐지 성능 평가 — 위치 정답(gold.jsonl)이 있는 평가셋으로 정밀도·재현율·F1 을 잰다.
//
//   node eval.mjs <평가셋 폴더> [--ner] [--json 결과.json] [--show-errors]
//
// 평가셋 형식: <폴더>/gold.jsonl 한 줄 = 문서 한 건
//   { "id", "file", "entities": [{ "type", "text", "start", "end" }] }
//
// 세 가지 기준으로 센다.
//   strict   : 종류와 시작·끝 위치가 모두 같아야 정답 (평가셋 권장 기준)
//   lenient  : 종류가 같고 범위가 겹치면 정답 (경계가 조금 다른 경우 허용)
//   coverage : 종류와 상관없이, 정답 범위가 가린 영역에 완전히 덮였는가
//              → "개인정보가 실제로 가려졌는가" 에 가장 가까운 숫자 (재현율만 의미 있음)

import fs from 'node:fs';
import path from 'node:path';
import { detect, DEFAULT_TYPES } from './lib/detect.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('사용법: node eval.mjs <평가셋 폴더> [--ner] [--json 결과.json] [--show-errors]');
  process.exit(1);
}
const useNer = args.includes('--ner');
const showErrors = args.includes('--show-errors');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const records = fs.readFileSync(path.join(dir, 'gold.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
let runNer = null;
if (useNer) ({ runNer } = await import('./lib/ner.mjs'));

const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const stats = {}; // type → { tp, fp, fn, ltp, lfp, lfn }
const st = (t) => (stats[t] ||= { tp: 0, fp: 0, fn: 0, ltp: 0, lfp: 0, lfn: 0 });
let goldTotal = 0;
let covered = 0;
const errors = [];

for (const rec of records) {
  const text = fs.readFileSync(path.join(dir, rec.file), 'utf8');
  const ner = runNer ? await runNer(text) : [];
  const pred = detect(text, { types: DEFAULT_TYPES, ner });
  const gold = rec.entities;

  // strict
  const predKeys = new Set(pred.map((p) => `${p.type}:${p.start}:${p.end}`));
  const goldKeys = new Set(gold.map((g) => `${g.type}:${g.start}:${g.end}`));
  for (const g of gold) (predKeys.has(`${g.type}:${g.start}:${g.end}`) ? st(g.type).tp++ : st(g.type).fn++);
  for (const p of pred) if (!goldKeys.has(`${p.type}:${p.start}:${p.end}`)) st(p.type).fp++;

  // lenient
  for (const g of gold) (pred.some((p) => p.type === g.type && overlaps(p, g)) ? st(g.type).ltp++ : st(g.type).lfn++);
  for (const p of pred) if (!gold.some((g) => g.type === p.type && overlaps(p, g))) st(p.type).lfp++;

  // coverage: 정답 범위의 모든 글자가 어떤 탐지에 덮였는가
  for (const g of gold) {
    goldTotal++;
    let ok = true;
    for (let i = g.start; i < g.end && ok; i++) {
      if (!/\s/.test(text[i]) && !pred.some((p) => p.start <= i && i < p.end)) ok = false;
    }
    if (ok) covered++;
    else errors.push({ id: rec.id, kind: 'MISS', type: g.type, text: g.text, found: pred.filter((p) => overlaps(p, g)).map((p) => `${p.type}:${p.value}`) });
  }
  for (const p of pred) {
    if (!gold.some((g) => overlaps(p, g))) errors.push({ id: rec.id, kind: 'FALSE_POSITIVE', type: p.type, text: p.value, source: p.source });
    else {
      const g = gold.find((x) => overlaps(p, x));
      if (g.type !== p.type || g.start !== p.start || g.end !== p.end) {
        errors.push({ id: rec.id, kind: g.type !== p.type ? 'WRONG_TYPE' : 'BOUNDARY', type: `${g.type}→${p.type}`, text: `${g.text} ⇢ ${p.value}` });
      }
    }
  }
}

const prf = (tp, fp, fn) => {
  const p = tp + fp ? tp / (tp + fp) : 0;
  const r = tp + fn ? tp / (tp + fn) : 0;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
};
const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);

const types = Object.keys(stats).sort();
const sum = (k) => types.reduce((a, t) => a + stats[t][k], 0);
const micro = prf(sum('tp'), sum('fp'), sum('fn'));
const microL = prf(sum('ltp'), sum('lfp'), sum('lfn'));

console.log(`평가셋: ${dir}  (문서 ${records.length}건, 정답 ${goldTotal}개${useNer ? ', --ner' : ''})\n`);
console.log('종류          정답  │ strict  P      R      F1   │ lenient P      R      F1');
console.log('─'.repeat(78));
for (const t of types) {
  const s = stats[t];
  const a = prf(s.tp, s.fp, s.fn);
  const b = prf(s.ltp, s.lfp, s.lfn);
  console.log(`${t.padEnd(12)} ${String(s.tp + s.fn).padStart(4)}  │ ${pct(a.p)} ${pct(a.r)} ${pct(a.f1)}  │ ${pct(b.p)} ${pct(b.r)} ${pct(b.f1)}`);
}
console.log('─'.repeat(78));
console.log(`${'전체(micro)'.padEnd(11)} ${String(goldTotal).padStart(4)}  │ ${pct(micro.p)} ${pct(micro.r)} ${pct(micro.f1)}  │ ${pct(microL.p)} ${pct(microL.r)} ${pct(microL.f1)}`);
console.log(`\n가려짐(coverage) 재현율: ${covered}/${goldTotal} = ${pct(covered / goldTotal).trim()}  ← 종류와 무관하게 정답 글자가 모두 가려진 비율`);

const byKind = errors.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {});
console.log(`오류 요약: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'}`);
if (showErrors) {
  for (const kind of ['MISS', 'FALSE_POSITIVE', 'WRONG_TYPE', 'BOUNDARY']) {
    const list = errors.filter((e) => e.kind === kind);
    if (!list.length) continue;
    console.log(`\n[${kind}] ${list.length}건`);
    for (const e of list) console.log(`  ${e.id.padEnd(12)} ${e.type.padEnd(22)} ${e.text}${e.found?.length ? `   (겹친 탐지: ${e.found.join(', ')})` : ''}${e.source ? `   [${e.source}]` : ''}`);
  }
}
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ dataset: dir, ner: useNer, records: records.length, gold: goldTotal, coverage: covered / goldTotal, micro, microLenient: microL, perType: stats, errors }, null, 2));
}
