// 독립 평가셋(veil-benchmark-ko) 기준선에서 드러난 누락을 일반 규칙으로 고친 것에 대한 회귀 테스트.
// 평가셋 문장을 그대로 쓰지 않고, 같은 원인의 다른 문장으로 확인한다.
import { expectHas, expectNone, table } from './helpers.mjs';

export default function ({ test, section }) {
  section('기준선 누락 원인별 회귀');
  table(test, '식별번호', [
    ['신규 직원 사번은 OPS-KR-2207이다.', 'EMPLOYEE_ID:OPS-KR-2207'],
    ['회원번호: MEM-0099 로 조회', 'EMPLOYEE_ID:MEM-0099'],
    ['예약 확인 번호는 RSV-2026-118이며', 'EMPLOYEE_ID:RSV-2026-118'],
    ['Customer ID: C-20391', 'EMPLOYEE_ID:C-20391'],
  ], expectHas);
  table(test, '회사·기관', [
    ['발주사 미리내물류와 회의', 'ORG:미리내물류'],
    ['의뢰기관은 해솔청소년센터이다', 'ORG:해솔청소년센터'],
    ['예금주는 가람데이터다.', 'ORG:가람데이터'],
  ], expectHas);
  table(test, '역할어 뒤 이름', [
    ['진행자: 문서윤', 'PERSON:문서윤'],
    ['내담자 고하늘의 보호자 연락', 'PERSON:고하늘'],
    ['퇴직 예정자 남궁진의 권한 회수', 'PERSON:남궁진'],
  ], expectHas);
  table(test, '형식 변형', [
    ['여권번호는 M12345678이다', 'PASSPORT:M12345678'],
    ['주민번호: 991399-1234567', 'RRN:991399-1234567'],
    ['광주광역시 서구 예시로 5 102동 303호', 'ADDRESS:광주광역시 서구 예시로 5 102동 303호'],
    ['업체,담당자,견적\n다온,최서윤,18,700,000원', ['PERSON:최서윤', 'AMOUNT:18,700,000원']],
    ['직원,비밀번호\n한지우,Tmp#2026!', 'SECRET:Tmp#2026!'],
  ], expectHas);
  table(test, '오탐 방지', [
    ['주문번호 1111과 티켓 번호 7007 확인'],
    ['고객센터, 데이터센터, 건강식품, 보안솔루션'],
    ['기관 평가 결과와 기관 담당자 회의'],
    ['대표 이사 선임과 대표 이사회 의결'],
    ['담당 지역, 환자 정보, 예금주 확인'],
    ['담당 전화는 내선으로, 이름은 비공개'],
  ], (text) => expectNone(text));
}
