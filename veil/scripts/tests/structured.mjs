// 표·데이터 속 민감정보 — CSV·TSV·마크다운 표의 열, JSON·YAML 키, 라벨 다음 줄
import { expectHas, expectNone, table } from './helpers.mjs';

export default function ({ test, section }) {
  section('표·데이터: 잡아야 함');
  table(test, '표', [
    ['이름,전화번호,메모\n김민수,010-1234-5678,VIP\n박서연,010-2222-3333,재구매', ['PERSON:김민수', 'PERSON:박서연', 'PHONE:010-2222-3333']],
    ['name,company,email\n"Smith, John",Acme Corp,js@acme.io\nKim Minsu,Raon Soft,km@raon.kr', ['PERSON:Smith, John', 'PERSON:Kim Minsu', 'ORG:Raon Soft']],
    ['고객명\t회사\t주소\n이지은\t미르텍\t서울시 마포구 월드컵로 12', ['PERSON:이지은', 'ORG:미르텍', 'ADDRESS:서울시 마포구 월드컵로 12']],
    ['| 담당자 | 연락처 |\n|---|---|\n| 김민수 | 010-1234-5678 |\n| Sarah Lee | sarah@x.io |', ['PERSON:김민수', 'PERSON:Sarah Lee']],
    ['성명;소속\n최민준;누리솔루션', ['PERSON:최민준', 'ORG:누리솔루션']],
    ['firstName,lastName\nSarah,Connor', ['PERSON:Sarah', 'PERSON:Connor']],
  ], expectHas);
  table(test, '키·라벨', [
    ['{"name": "김민수", "customer": "John Smith", "company": "블루랩"}', ['PERSON:김민수', 'PERSON:John Smith', 'ORG:블루랩']],
    ['{"author": "Jane Doe <jane@x.com>"}', ['PERSON:Jane Doe', 'EMAIL:jane@x.com']],
    ['customer: Kim Minsu\nowner: 박서연\ncompany: Northwind Traders', ['PERSON:Kim Minsu', 'PERSON:박서연', 'ORG:Northwind Traders']],
    ['보고자\n김민수\n', 'PERSON:김민수'],
  ], expectHas);
  test('표에서 잡힌 이름은 본문에서도 가린다', () => {
    expectHas('이름,등급\nKim Minsu,VIP\n\n메모: Kim Minsu 고객이 재구매 문의', 'PERSON:Kim Minsu');
  });

  section('표·데이터: 잡으면 안 됨');
  table(test, '없음', [
    ['{"name": "veil-scripts", "private": true, "author": "", "license": "MIT"}'],
    ['---\nname: veil\ndescription: masks things\n---'],
    ['services:\n  db:\n    image: postgres\n    container_name: app_db'],
    ['date,amount,status\n2026-01-01,100,ok'],
    ['이름,메모\n-,없음\n미정,TBD'],
    ['| 제품명 | 가격 |\n|---|---|\n| 노트북 | 100 |'],
    ['name: Production Cluster 2'],
    ['이름, 주소, 연락처를 적어 주세요.\n그리고 서명, 날짜, 도장도 필요합니다.'],
    ['{"owner": "platform-team", "manager": "npm"}'],
    ['customer,plan\nN/A,free\nunknown,pro'],
  ], (text) => expectNone(text));
}
