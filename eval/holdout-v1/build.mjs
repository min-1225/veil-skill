#!/usr/bin/env node
// source.txt(표기본)에서 평가용 문서(docs/*.txt)와 정답(gold.jsonl)을 만든다.
//   node eval/holdout-v1/build.mjs
// 표기: ⟦TYPE:값⟧  →  문서에는 값만 남고, 정답에는 { type, text, start, end } 가 기록된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'source.txt'), 'utf8');
const MARK = /⟦([A-Z_]+):([^⟧]+)⟧/g;

const docs = [];
for (const block of src.split(/^=== /m).slice(1)) {
  const nl = block.indexOf('\n');
  const id = block.slice(0, nl).trim();
  const body = block.slice(nl + 1).replace(/\n+$/, '\n');
  let text = '';
  let cursor = 0;
  const entities = [];
  for (const m of body.matchAll(MARK)) {
    text += body.slice(cursor, m.index);
    const start = text.length;
    text += m[2];
    entities.push({ type: m[1], text: m[2], start, end: text.length });
    cursor = m.index + m[0].length;
  }
  text += body.slice(cursor);
  if (/[⟦⟧]/.test(text)) throw new Error(`${id}: 닫히지 않은 표기가 있어요`);
  docs.push({ id, text, entities });
}

const outDir = path.join(here, 'docs');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
const lines = docs.map((d) => {
  const file = `docs/${d.id}.txt`;
  fs.writeFileSync(path.join(here, file), d.text, 'utf8');
  for (const e of d.entities) if (d.text.slice(e.start, e.end) !== e.text) throw new Error(`${d.id}: 위치 계산 오류`);
  return JSON.stringify({ id: d.id, file, entities: d.entities });
});
fs.writeFileSync(path.join(here, 'gold.jsonl'), `${lines.join('\n')}\n`, 'utf8');
const total = docs.reduce((a, d) => a + d.entities.length, 0);
console.log(`문서 ${docs.length}건, 정답 개체 ${total}개 → docs/, gold.jsonl`);
