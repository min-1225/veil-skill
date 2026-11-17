#!/usr/bin/env node
// Veil 자체 테스트: node selftest.mjs
// 탐지·토큰화·복원·유출 검사가 기대대로 동작하는지 확인한다.

import assert from 'node:assert/strict';
import { detect } from './lib/detect.mjs';
import { checkLeak, unveil, veil } from './lib/tokenize.mjs';
import { alignTokens } from './lib/ner.mjs';

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}
const values = (text, opts) => detect(text, opts).map((d) => `${d.type}:${d.value}`);

const MEETING = `참석: 김철수, 박지영
김철수 팀장이 삼성전자 납품 단가를 3억 2천만원으로 제안. 고객사는 ㈜한빛테크로 확정, 한빛테크 담당은 이민호 이사.
박지영이랑 법무팀 검토. 연락처 010-1234-5678, chulsoo.kim@example.com
계좌 110-123-456789, 카드 1234-5678-9012-3456, 주민번호 900101-1234567
장소: 서울특별시 강남구 테헤란로 123, 서버 192.168.0.10, 예산 $50,000`;

console.log('탐지');
test('고위험 패턴을 모두 잡는다', () => {
  const v = values(MEETING);
  for (const want of ['PHONE:010-1234-5678', 'EMAIL:chulsoo.kim@example.com', 'ACCOUNT:110-123-456789',
    'CARD:1234-5678-9012-3456', 'RRN:900101-1234567', 'IP:192.168.0.10']) {
    assert.ok(v.includes(want), `${want} 없음: ${v.join(' | ')}`);
  }
});
test('회사명: 사전, ㈜ 접두어(이름만), 반복 등장', () => {
  const v = values(MEETING);
  assert.ok(v.includes('ORG:삼성전자'));
  assert.equal(v.filter((x) => x === 'ORG:한빛테크').length, 2, v.join(' | '));
});
test('인명: 직함, 이름 나열, 조사(이랑) 붙은 반복 등장', () => {
  const v = values(MEETING);
  assert.equal(v.filter((x) => x === 'PERSON:김철수').length, 2, v.join(' | '));
  assert.equal(v.filter((x) => x === 'PERSON:박지영').length, 2, v.join(' | '));
  assert.ok(v.includes('PERSON:이민호'));
});
test('금액·주소', () => {
  const v = values(MEETING);
  assert.ok(v.includes('AMOUNT:3억 2천만원'), v.join(' | '));
  assert.ok(v.includes('AMOUNT:$50,000'));
  assert.ok(v.some((x) => x.startsWith('ADDRESS:서울특별시 강남구 테헤란로 123')), v.join(' | '));
});
test('일반 단어를 사람/회사로 잡지 않는다', () => {
  const text = '정리하면 이번 분기 목표는 고객사를 2곳 더 늘리는 것. 문제를 줄이고 조직도를 고치자. 우리 그룹은 TASK 관리를 Jira로 한다. 신용카드 결제.';
  const v = values(text);
  assert.deepEqual(v, [], v.join(' | '));
});
test('주소: 시·도 + 여러 단계 + 도로명 + 번호 + 층을 한 덩어리로', () => {
  const v = values('배송지는 경기도 성남시 분당구 판교역로 235 3층.');
  assert.deepEqual(v, ['ADDRESS:경기도 성남시 분당구 판교역로 235 3층'], v.join(' | '));
});
test('주소: 시·도 없이 구+도로명, 도로명+번호만', () => {
  assert.deepEqual(values('사무실은 분당구 판교역로 235 입니다'), ['ADDRESS:분당구 판교역로 235']);
  assert.deepEqual(values('테헤란로 123 2층에서 봐요'), ['ADDRESS:테헤란로 123 2층']);
});
test('주소 오탐 방지: "회의실로 3시", "본사로 10명"', () => {
  assert.deepEqual(values('회의실로 3시에 모이고 본사로 10명 이동'), []);
});
test('"OO 주식회사 구매팀"의 부서명을 회사로 잡지 않는다', () => {
  const v = values('고객: 장민혁 님 (블루오션랩 주식회사 구매팀)');
  assert.ok(v.includes('ORG:블루오션랩 주식회사'), v.join(' | '));
  assert.ok(!v.some((x) => x.includes('구매팀')), v.join(' | '));
  assert.deepEqual(values('주식회사 한빛 계약'), ['ORG:한빛']);
});
test('회사명: 접미어 뒤 조사, "경쟁사 OO" 문맥', () => {
  const v = values('경쟁사 라온소프트에서 제안. 협력사 누리로 넘김. 경쟁사 동향 파악, 고객사 확정.');
  assert.ok(v.includes('ORG:라온소프트'), v.join(' | '));
  assert.ok(v.includes('ORG:누리'), v.join(' | '));
  assert.ok(!v.some((x) => /동향|확정/.test(x)), v.join(' | '));
});
test('"배송지는", "주문서를" 같은 일반 명사를 이름으로 잡지 않는다', () => {
  assert.deepEqual(values('배송지는 확인됨. 주문서를 보내고 사용자가 확인.'), []);
});
test('날짜는 기본 꺼짐, --add-types DATE 로 켜짐', () => {
  const t = '2026년 3월 5일 회의';
  assert.deepEqual(values(t), []);
  assert.deepEqual(values(t, { types: ['DATE'] }), ['DATE:2026년 3월 5일']);
});
test('사용자 사전(임의 종류)과 allow 목록', () => {
  const t = '블루문 프로젝트는 김철수 팀장이 맡는다. 삼성전자와 협업.';
  const v = values(t, { dictionary: { PROJECT: ['블루문'] }, allow: ['삼성전자'] });
  assert.ok(v.includes('PROJECT:블루문'));
  assert.ok(!v.some((x) => x.includes('삼성')), v.join(' | '));
});

console.log('다국어·국제 형식');
const EN = `Attendees: John Smith, Priya Patel
CEO John Smith reviewed the Acme Corp. renewal. Smith wants a discount.
Dr. Laura Mendes from Blue Harbor Labs: laura@blueharbor.io, +1 (415) 555-0132.
Wire €250,000 to IBAN DE89 3704 0044 0532 0130 00. Card 4111 1111 1111 1111.
Ship to 1600 Amphitheatre Parkway, Mountain View, CA 94043. UK office: SW1A 1AA.
Passport no. X12345678, SSN 123-45-6789. VPN 2001:db8:85a3::8a2e:370:7334.
The Group agreed that our team will finalize the roadmap by Friday.`;
test('영어: 이름(직함·역할·참석자 목록), 성만 나온 경우', () => {
  const v = values(EN);
  for (const want of ['PERSON:John Smith', 'PERSON:Priya Patel', 'PERSON:Laura Mendes', 'PERSON:Smith']) {
    assert.ok(v.includes(want), `${want} 없음: ${v.join(' | ')}`);
  }
});
test('영어: 회사, 국제 전화, IBAN, Luhn 카드, 주소, 여권, SSN, IPv6, 외화', () => {
  const v = values(EN);
  for (const want of ['ORG:Acme Corp.', 'ORG:Blue Harbor Labs', 'PHONE:+1 (415) 555-0132',
    'ACCOUNT:DE89 3704 0044 0532 0130 00', 'CARD:4111 1111 1111 1111',
    'ADDRESS:1600 Amphitheatre Parkway, Mountain View, CA 94043', 'ADDRESS:SW1A 1AA',
    'PASSPORT:X12345678', 'SSN:123-45-6789', 'IP:2001:db8:85a3::8a2e:370:7334', 'AMOUNT:€250,000']) {
    assert.ok(v.includes(want), `${want} 없음: ${v.join(' | ')}`);
  }
});
test('영어 일반 표현(The Group, our team)은 건드리지 않는다', () => {
  const v = values('The Group agreed that our team will finalize the roadmap by Friday. Sales Team sync.');
  assert.deepEqual(v, [], v.join(' | '));
});
test('체크섬: 붙여 쓴 숫자는 틀리면 무시, 4-4-4-4 형식은 틀려도 가리되 확인 필요', () => {
  assert.deepEqual(values('order 4111111111111112 shipped'), []);
  assert.ok(!values('ref DE00 3704 0044 0532 0130 00').some((x) => x.startsWith('ACCOUNT')));
  const d = detect('card 1234-5678-9012-3456');
  assert.equal(d[0].type, 'CARD');
  assert.equal(d[0].uncertain, true);
});
test('일본어: 경칭 이름, 株式会社(조사 앞에서 끊기), 우편번호·주소, 휴대폰', () => {
  const v = values('参加者：田中さん、山田太郎様\n株式会社サンプルの見積もりは¥3,000,000。サンプルからの回答待ち。\n090-1234-5678 〒100-0005 東京都千代田区丸の内1-9-2');
  for (const want of ['PERSON:田中', 'PERSON:山田太郎', 'AMOUNT:¥3,000,000', 'PHONE:090-1234-5678', 'ADDRESS:〒100-0005', 'ADDRESS:東京都千代田区丸の内1-9-2']) {
    assert.ok(v.includes(want), `${want} 없음: ${v.join(' | ')}`);
  }
  assert.equal(v.filter((x) => x === 'ORG:サンプル').length, 2, v.join(' | '));
});
test('중국어: 호칭 이름, 有限公司(+약칭), 주소, 금액, 국제 전화', () => {
  const v = values('参会：王伟先生、李娜女士\n华为技术有限公司报价为500万元，华为希望下周确认。\n地址：北京市朝阳区建国路88号 电话：+86 138 0013 8000');
  for (const want of ['PERSON:王伟', 'PERSON:李娜', 'ORG:华为技术有限公司', 'ORG:华为', 'AMOUNT:500万元', 'ADDRESS:北京市朝阳区建国路88号', 'PHONE:+86 138 0013 8000']) {
    assert.ok(v.includes(want), `${want} 없음: ${v.join(' | ')}`);
  }
});
test('NER 결과 위치 맞추기 (모델 없이, 토큰 조각 → 원문 위치)', () => {
  const text = 'Sarah met Pierre Dubois at Northwind in Paris.';
  const tokens = [
    { entity: 'B-PER', score: 0.99, index: 1, word: 'Sarah' },
    { entity: 'B-PER', score: 0.99, index: 3, word: 'Pierre' },
    { entity: 'I-PER', score: 0.99, index: 4, word: 'Dub' },
    { entity: 'I-PER', score: 0.99, index: 5, word: '##ois' },
    { entity: 'B-ORG', score: 0.99, index: 7, word: 'North' }, // ##wind 를 놓쳐도 단어 끝까지 늘어나야 함
    { entity: 'B-LOC', score: 0.99, index: 10, word: 'Paris' },
  ];
  const spans = alignTokens(text, tokens).map((s) => `${s.type}:${text.slice(s.start, s.end)}`);
  assert.deepEqual(spans, ['PERSON:Sarah', 'PERSON:Pierre Dubois', 'ORG:Northwind', 'LOCATION:Paris']);
});
test('NER 은 규칙이 잡은 더 긴 덩어리를 쪼개지 않는다', () => {
  const text = '地址：北京市朝阳区建国路88号';
  const s = text.indexOf('北京市');
  const v = values(text, { ner: [{ type: 'LOCATION', start: s, end: s + 3, score: 0.99 }] });
  assert.deepEqual(v, ['ADDRESS:北京市朝阳区建国路88号'], v.join(' | '));
});

console.log('토큰화·복원');
test('같은 값은 같은 토큰, 왕복하면 원문과 같다', () => {
  const r = veil(MEETING);
  assert.ok(r.leak.clean, JSON.stringify(r.leak));
  const kim = r.entries.find((e) => e.original === '김철수');
  assert.equal(r.veiled.split(kim.token).length - 1, 2);
  assert.equal(unveil(r.veiled, r.entries).text, MEETING);
});
test('AI 결과물 복원: 모르는 토큰은 남기고, 괄호 빠진 토큰은 --loose 에서만', () => {
  const r = veil('김철수 팀장이 삼성전자 건 담당.');
  const p = r.entries.find((e) => e.type === 'PERSON').token; // [PERSON_1]
  const summary = `담당: ${p}, 고객: [ORG_1], 기타: [PERSON_9], 메모: ${p.slice(1, -1)}님`;
  const strict = unveil(summary, r.entries);
  assert.equal(strict.text, '담당: 김철수, 고객: 삼성전자, 기타: [PERSON_9], 메모: PERSON_1님');
  assert.deepEqual(Object.keys(strict.unknown), ['[PERSON_9]']);
  assert.equal(unveil(summary, r.entries, { loose: true }).text, '담당: 김철수, 고객: 삼성전자, 기타: [PERSON_9], 메모: 김철수님');
});
test('복원할 때 조사를 원문 받침에 맞춘다', () => {
  const entries = [
    { token: '[PERSON_1]', type: 'PERSON', original: '김철수' }, // 받침 없음
    { token: '[PERSON_2]', type: 'PERSON', original: '박지영' }, // 받침 있음
    { token: '[ORG_1]', type: 'ORG', original: '서울' },       // ㄹ 받침
    { token: '[ORG_2]', type: 'ORG', original: 'Google' },     // 영문: 손대지 않음
  ];
  const r = unveil('[PERSON_1]이 [PERSON_2]가 [PERSON_1](이)가 [PERSON_2]를 [ORG_1]으로 [PERSON_2]로 [ORG_2]이 [PERSON_1]이사 [PERSON_2]와', entries);
  assert.equal(r.text, '김철수가 박지영이 김철수가 박지영을 서울로 박지영으로 Google이 김철수이사 박지영과');
});
test('[PERSON_1] 과 [PERSON_10] 을 헷갈리지 않는다', () => {
  const entries = [
    { token: '[PERSON_1]', type: 'PERSON', original: 'A' },
    { token: '[PERSON_10]', type: 'PERSON', original: 'B' },
  ];
  assert.equal(unveil('[PERSON_10] [PERSON_1]', entries).text, 'B A');
});
test('두 번째 파일은 기존 대응표를 이어 쓴다 (같은 사람 = 같은 토큰)', () => {
  const a = veil('김철수 팀장 회의');
  const b = veil('어제 김철수랑 박영희 과장이 통화', { prior: a.entries });
  const kimA = a.entries.find((e) => e.original === '김철수').token;
  const kimB = b.entries.find((e) => e.original === '김철수').token;
  assert.equal(kimA, kimB);
  assert.ok(b.veiled.includes(`${kimB}랑`), b.veiled);
  assert.ok(b.entries.some((e) => e.original === '박영희' && e.token === '[PERSON_2]'));
});
test('유출 검사: 대응표 원문과 고위험 패턴 잔존을 잡는다', () => {
  const entries = [{ token: '[PERSON_1]', type: 'PERSON', original: '김철수' }];
  const leak = checkLeak('[PERSON_1] 그리고 김철수, 010-9999-8888', entries);
  assert.equal(leak.clean, false);
  assert.equal(leak.residualOriginals.length, 1);
  assert.equal(leak.residualPatterns[0].type, 'PHONE');
  assert.ok(!JSON.stringify(leak).includes('9999'), '유출 리포트에 원문이 들어가면 안 됨');
});

// 실제 NER 모델 테스트 — `node selftest.mjs --ner` 일 때만 (npm install + 모델 다운로드 필요)
if (process.argv.includes('--ner')) {
  console.log('NER 모델 (실제 실행)');
  const { runNer } = await import('./lib/ner.mjs');
  const text = 'Sarah said Michael talked to Northwind about Berlin. Le directeur Pierre Dubois travaille chez Renault à Paris.';
  const ents = await runNer(text);
  test('영어·프랑스어 이름·회사·지명을 찾는다', () => {
    const got = ents.map((e) => `${e.type}:${text.slice(e.start, e.end)}`);
    for (const want of ['PERSON:Sarah', 'PERSON:Michael', 'ORG:Northwind', 'LOCATION:Berlin', 'PERSON:Pierre Dubois', 'ORG:Renault', 'LOCATION:Paris']) {
      assert.ok(got.includes(want), `${want} 없음: ${got.join(' | ')}`);
    }
  });
}

console.log(`\n${passed}개 통과, ${failures.length}개 실패`);
process.exit(failures.length ? 1 : 0);
