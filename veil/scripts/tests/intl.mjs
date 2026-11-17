// 영어·일본어·중국어 + 언어 무관 국제 형식
import { expectHas, table } from './helpers.mjs';

export default function ({ test, section }) {
  section('영어');
  table(test, '인명', [
    ['Mr. John Smith will call', 'PERSON:John Smith'],
    ['Dr. Laura Mendes signed it', 'PERSON:Laura Mendes'],
    ['Ms. Priya Patel joined', 'PERSON:Priya Patel'],
    ['CEO Jane Doe approved the budget', 'PERSON:Jane Doe'],
    ['Product Manager Alex Kim owns this', 'PERSON:Alex Kim'],
    ['Mark Lee, CTO, will present', 'PERSON:Mark Lee'],
    ['Attendees: Emily Chen, Raj Singh', ['PERSON:Emily Chen', 'PERSON:Raj Singh']],
    ['Prepared by: Sofia Rossi', 'PERSON:Sofia Rossi'],
  ], expectHas);
  test('영어: 성만 다시 나와도 가린다 (John Smith … Smith)', () => {
    expectHas('CEO John Smith joined. Later Smith left early.', ['PERSON:John Smith', 'PERSON:Smith']);
  });
  table(test, '회사', [
    ['We signed with Acme Corp. yesterday', 'ORG:Acme Corp.'],
    ['Globex Inc reported losses', 'ORG:Globex Inc'],
    ['Initech Ltd. sent the invoice', 'ORG:Initech Ltd.'],
    ['Muller Bau GmbH is the contractor', 'ORG:Muller Bau GmbH'],
    ['Blue Harbor Labs will send the NDA', 'ORG:Blue Harbor Labs'],
  ], expectHas);
  table(test, '연락처·주소·금액', [
    ['Call +1 (415) 555-0132 today', 'PHONE:+1 (415) 555-0132'],
    ['Office line (212) 555-0199', 'PHONE:(212) 555-0199'],
    ['UK number +44 20 7946 0958', 'PHONE:+44 20 7946 0958'],
    ['Ship to 1600 Amphitheatre Parkway, Mountain View, CA 94043', 'ADDRESS:1600 Amphitheatre Parkway, Mountain View, CA 94043'],
    ['Meet at 221B Baker Street', 'ADDRESS:221B Baker Street'],
    ['London office SW1A 1AA', 'ADDRESS:SW1A 1AA'],
    ['Budget is $50,000', 'AMOUNT:$50,000'],
    ['Fee of €1,200 applies', 'AMOUNT:€1,200'],
    ['Raised USD 2.5M last year', 'AMOUNT:USD 2.5M'],
    ['about 3 million dollars total', 'AMOUNT:3 million dollars'],
  ], expectHas);
  table(test, '날짜(켰을 때)', [
    ['Due Nov 17, 2026', 'DATE:Nov 17, 2026'],
    ['Signed on 5 March 2026', 'DATE:5 March 2026'],
  ], (text, want) => expectHas(text, want, { types: ['DATE'] }));

  section('일본어');
  table(test, '일본어', [
    ['田中さんに確認', 'PERSON:田中'],
    ['山田太郎様へ送付', 'PERSON:山田太郎'],
    ['佐藤部長の承認', 'PERSON:佐藤'],
    ['株式会社サンプルの見積もり', 'ORG:サンプル'],
    ['サンプル株式会社と契約', 'ORG:サンプル株式会社'],
    ['連絡先 090-1234-5678', 'PHONE:090-1234-5678'],
    ['〒100-0005 東京都千代田区丸の内1-9-2', ['ADDRESS:〒100-0005', 'ADDRESS:東京都千代田区丸の内1-9-2']],
    ['見積もりは¥3,000,000です', 'AMOUNT:¥3,000,000'],
  ], expectHas);

  section('중국어');
  table(test, '중국어', [
    ['王伟先生已经确认', 'PERSON:王伟'],
    ['请李娜女士签字', 'PERSON:李娜'],
    ['华为技术有限公司报价', 'ORG:华为技术有限公司'],
    ['阿里巴巴集团发布公告', 'ORG:阿里巴巴集团'],
    ['地址：北京市朝阳区建国路88号', 'ADDRESS:北京市朝阳区建国路88号'],
    ['报价为500万元', 'AMOUNT:500万元'],
    ['电话：+86 138 0013 8000', 'PHONE:+86 138 0013 8000'],
  ], expectHas);

  section('언어 무관 형식');
  table(test, '형식', [
    ['IBAN DE89 3704 0044 0532 0130 00', 'ACCOUNT:DE89 3704 0044 0532 0130 00'],
    ['IBAN GB82WEST12345698765432', 'ACCOUNT:GB82WEST12345698765432'],
    ['Visa 4111 1111 1111 1111', 'CARD:4111 1111 1111 1111'],
    ['Amex 378282246310005', 'CARD:378282246310005'],
    ['SSN 123-45-6789 on file', 'SSN:123-45-6789'],
    ['Passport no. X12345678', 'PASSPORT:X12345678'],
    ['여권번호 M12345678 확인', 'PASSPORT:M12345678'],
    ['server 192.168.0.10 down', 'IP:192.168.0.10'],
    ['VPN 2001:db8:85a3::8a2e:370:7334', 'IP:2001:db8:85a3::8a2e:370:7334'],
    ['mail me at first.last+tag@sub.example.org', 'EMAIL:first.last+tag@sub.example.org'],
  ], expectHas);
}
