// 토큰화 · 대응표 · 옵션 동작
import assert from 'node:assert/strict';
import { findPreexistingTokens, unveil, veil } from '../lib/tokenize.mjs';
import { values } from './helpers.mjs';

export default function ({ test, section }) {
  section('토큰화·왕복');
  const ROUNDTRIP = {
    한국어: '김철수 팀장(010-1234-5678)이 ㈜한빛테크에 3억원 제안. 김철수랑 박지영 대리가 검토.',
    영어: 'CEO John Smith emailed jane@acme.io about Acme Corp. paying $50,000. Smith agreed.',
    혼합: '田中さん, 王伟先生, Dr. Laura Mendes와 김민수이고 IBAN DE89 3704 0044 0532 0130 00 공유',
  };
  for (const [name, text] of Object.entries(ROUNDTRIP)) {
    test(`왕복하면 원문과 같다: ${name}`, () => {
      const r = veil(text);
      assert.ok(r.leak.clean, JSON.stringify(r.leak));
      assert.equal(unveil(r.veiled, r.entries, { josa: false }).text, text);
    });
  }
  test('같은 값은 같은 토큰, 다른 값은 다른 번호', () => {
    const r = veil('김철수 팀장, 박지영 대리, 김철수 팀장');
    assert.equal(r.veiled, '[PERSON_1] 팀장, [PERSON_2] 대리, [PERSON_1] 팀장');
  });
  test('번호는 종류마다 따로 센다', () => {
    const r = veil('김철수 팀장 010-1111-2222, 박지영 대리 010-3333-4444');
    assert.ok(r.veiled.includes('[PHONE_2]') && r.veiled.includes('[PERSON_2]') && !r.veiled.includes('[PHONE_3]'), r.veiled);
  });
  test('기존 대응표를 이어 쓰면 번호가 이어진다', () => {
    const a = veil('김철수 팀장');
    const b = veil('최수진 과장과 김철수랑 통화', { prior: a.entries });
    assert.equal(b.veiled, '[PERSON_2] 과장과 [PERSON_1]랑 통화');
  });
  test('원문에 이미 토큰 모양 글자가 있으면 찾아낸다', () => {
    assert.deepEqual(findPreexistingTokens('템플릿 [PERSON_1] 과 [ORG_12] 자리'), ['[PERSON_1]', '[ORG_12]']);
  });

  section('옵션');
  test('--types: 고른 종류만 가린다', () => {
    assert.deepEqual(values('김철수 팀장 010-1234-5678 3억원', { types: ['PHONE'] }), ['PHONE:010-1234-5678']);
  });
  test('--allow: 허용 단어와 그 안의 일부는 가리지 않는다', () => {
    const v = values('㈜한빛테크 김철수 팀장', { allow: ['한빛테크'] });
    assert.deepEqual(v, ['PERSON:김철수']);
  });
  test('--dict: 사전 단어가 이메일 규칙보다 우선한다', () => {
    const url = 'jdbc:mysql://db.example.com/app?user=admin@corp.com';
    assert.deepEqual(values(url, { dictionary: { DBURL: [url] } }), [`DBURL:${url}`]);
  });
}
