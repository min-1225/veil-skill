// 작은 단위 함수 — 체크섬, 마스킹, NER 청크 나누기
import assert from 'node:assert/strict';
import { detect, foldWidth, maskValue } from '../lib/detect.mjs';
import { checkLeak, unveil, veil } from '../lib/tokenize.mjs';
import { chunkText } from '../lib/ner.mjs';
import { ibanValid, luhnValid } from '../lib/rules-intl.mjs';

export default function ({ test, section }) {
  section('단위 함수');
  test('Luhn: 실제 테스트 카드번호는 통과, 한 자리만 바꾸면 실패', () => {
    for (const ok of ['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117']) assert.ok(luhnValid(ok), ok);
    for (const bad of ['4111111111111112', '1234567812345678', '5555555555554445']) assert.ok(!luhnValid(bad), bad);
  });
  test('IBAN mod 97: 올바른 IBAN 통과, 틀린 체크 숫자는 실패', () => {
    for (const ok of ['DE89 3704 0044 0532 0130 00', 'GB82WEST12345698765432', 'FR1420041010050500013M02606']) assert.ok(ibanValid(ok), ok);
    for (const bad of ['DE00 3704 0044 0532 0130 00', 'GB82WEST12345698765433', 'XX12']) assert.ok(!ibanValid(bad), bad);
  });
  test('마스킹은 첫 글자만 남기고 길이는 8칸까지만 드러낸다', () => {
    assert.equal(maskValue('김철수'), '김**');
    assert.equal(maskValue('a'), 'a*');
    assert.equal(maskValue('verylongsecretvalue'), 'v********');
    assert.equal(maskValue(''), '');
  });
  test('전각 접기: 글자 수가 그대로라 위치가 원문과 같다', () => {
    const s = '０１０－１２３４－５６７８　ＡＢＣ';
    assert.equal(foldWidth(s), '010-1234-5678 ABC');
    assert.equal(foldWidth(s).length, s.length);
  });
  test('전각 숫자 전화번호·주민번호도 잡고, 값은 원문(전각) 그대로 되돌린다', () => {
    const text = '연락처 ０１０－１２３４－５６７８, 주민번호 ９００１０１－１２３４５６７';
    const v = detect(text).map((d) => `${d.type}:${d.value}`);
    assert.ok(v.includes('PHONE:０１０－１２３４－５６７８'), v.join(' | '));
    assert.ok(v.includes('RRN:９００１０１－１２３４５６７'), v.join(' | '));
    const r = veil(text);
    assert.equal(r.veiled, '연락처 [PHONE_1], 주민번호 [RRN_1]');
    assert.ok(r.leak.clean);
    assert.equal(unveil(r.veiled, r.entries).text, text);
  });
  test('유출 검사도 전각으로 남은 번호를 찾는다', () => {
    const leak = checkLeak('요약: 전화 ０１０－９８７６－５４３２ 로 연락', []);
    assert.ok(!leak.clean);
    assert.equal(leak.residualPatterns[0].type, 'PHONE');
  });
  test('NER 청크: 줄 경계에서 자르고, 이어 붙이면 원문과 같다', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Line ${i}: Sarah met Michael in Berlin.`).join('\n');
    const chunks = chunkText(text, 200);
    assert.ok(chunks.length > 1);
    assert.equal(chunks.map((c) => c.text).join(''), text);
    for (const c of chunks) assert.equal(text.slice(c.offset, c.offset + c.text.length), c.text);
  });
}
