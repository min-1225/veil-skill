// 작은 단위 함수 — 체크섬, 마스킹, NER 청크 나누기
import assert from 'node:assert/strict';
import { maskValue } from '../lib/detect.mjs';
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
  test('NER 청크: 줄 경계에서 자르고, 이어 붙이면 원문과 같다', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Line ${i}: Sarah met Michael in Berlin.`).join('\n');
    const chunks = chunkText(text, 200);
    assert.ok(chunks.length > 1);
    assert.equal(chunks.map((c) => c.text).join(''), text);
    for (const c of chunks) assert.equal(text.slice(c.offset, c.offset + c.text.length), c.text);
  });
}
