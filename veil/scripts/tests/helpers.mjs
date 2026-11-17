// 테스트 공통 도우미 — 표(배열) 한 줄이 테스트 하나가 되도록 짧은 검사 함수를 만든다.
import assert from 'node:assert/strict';
import { detect } from '../lib/detect.mjs';

export const values = (text, opts) => detect(text, opts).map((d) => `${d.type}:${d.value}`);

/** text 에서 expected('TYPE:값') 가 모두 잡혀야 한다 */
export function expectHas(text, expected, opts) {
  const v = values(text, opts);
  for (const want of [].concat(expected)) assert.ok(v.includes(want), `${want} 없음 ← ${JSON.stringify(text)}\n탐지: ${v.join(' | ') || '(없음)'}`);
}

/** text 에서 아무것도 잡히면 안 된다 */
export function expectNone(text, opts) {
  const v = values(text, opts);
  assert.deepEqual(v, [], `오탐 ← ${JSON.stringify(text)}\n탐지: ${v.join(' | ')}`);
}

/** text 에서 해당 종류(또는 'TYPE:값')가 잡히면 안 된다 */
export function expectNot(text, banned, opts) {
  const v = values(text, opts);
  for (const b of [].concat(banned)) {
    const hit = b.includes(':') ? v.includes(b) : v.some((x) => x.startsWith(`${b}:`));
    assert.ok(!hit, `${b} 가 잡히면 안 됨 ← ${JSON.stringify(text)}\n탐지: ${v.join(' | ')}`);
  }
}

/** 표의 각 줄을 테스트로 등록한다. rows: [[text, expected], ...] */
export function table(test, label, rows, check) {
  for (const row of rows) {
    const [text] = row;
    const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    test(`${label}: ${short.replace(/\n/g, '⏎')}`, () => check(...row));
  }
}
