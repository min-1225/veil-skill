// Veil 탐지 엔진 — 규칙(정규식) + 사전 + 언어별 휴리스틱 (VeilNote 엔진 기반)
//
// 원본: min-1225/Hackathon-CodeGate-2026
//   backend/src/shared/detector.js  (주민번호·카드·이메일·전화·금액·날짜)
//   frontend/src/lib/tokenizer.ts   (회사명 사전·접미어, 인명 성씨+직함/조사)
// 두 쪽에 흩어져 있던 탐지 종류를 하나로 합치고, 스킬용으로 보강했다.
// 다국어 규칙(영어·일본어·중국어, 국제 형식)은 rules-intl.mjs, 선택 기능인 NER 은 ner.mjs.
// 이 파일은 외부 의존성 없음 (Node 18+).

import { detectIntlOrgs, detectIntlPersons, INTL_REGEX_RULES, luhnValid } from './rules-intl.mjs';
import { detectSecrets } from './rules-secrets.mjs';
import { detectStructured } from './rules-structured.mjs';

/** 탐지 종류와 설명. defaultOn=false 인 종류는 --types 로 켜야 한다. */
export const ENTITY_TYPES = {
  RRN: { label: '주민등록번호/외국인등록번호', defaultOn: true, highRisk: true },
  SSN: { label: '미국 사회보장번호(SSN)', defaultOn: true, highRisk: true },
  PASSPORT: { label: '여권번호', defaultOn: true, highRisk: true },
  SECRET: { label: '비밀번호·API 키·토큰·접속 주소', defaultOn: true, highRisk: true },
  EMPLOYEE_ID: { label: '사번·직원번호', defaultOn: true, highRisk: true },
  CARD: { label: '카드번호', defaultOn: true, highRisk: true },
  EMAIL: { label: '이메일', defaultOn: true, highRisk: true },
  PHONE: { label: '전화번호', defaultOn: true, highRisk: true },
  ACCOUNT: { label: '계좌번호·IBAN', defaultOn: true, highRisk: true },
  IP: { label: 'IP 주소(v4·v6)', defaultOn: true, highRisk: false },
  ADDRESS: { label: '주소', defaultOn: true, highRisk: false },
  AMOUNT: { label: '금액', defaultOn: true, highRisk: false },
  ORG: { label: '회사·기관명', defaultOn: true, highRisk: false },
  PERSON: { label: '인명', defaultOn: true, highRisk: false },
  LOCATION: { label: '지명 (--ner 에서만)', defaultOn: true, highRisk: false },
  DATE: { label: '날짜', defaultOn: false, highRisk: false },
};

export const DEFAULT_TYPES = Object.keys(ENTITY_TYPES).filter((t) => ENTITY_TYPES[t].defaultOn);
export const HIGH_RISK_TYPES = Object.keys(ENTITY_TYPES).filter((t) => ENTITY_TYPES[t].highRisk);

// ───────────────────────── 정규식 규칙 ─────────────────────────

const PROVINCES =
  '서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청북|충청남|전북|전남|전라북|전라남|경북|경남|경상북|경상남|제주';

// 주소 뒷부분: 층·호수
const ADDRESS_FLOOR = `(?:,?\\s?(?:지하\\s?)?\\d{1,3}층)?(?:\\s?\\d{1,5}호)?`;
// 주소 뒷부분: 읍면동 → 도로명(+번길) → 번지/건물번호 → 층·호수
const ADDRESS_TAIL =
  `(?:\\s[가-힣0-9]{1,10}(?:읍|면|동|가|리))*` +
  `(?:\\s[가-힣0-9]{1,12}(?:로|길)(?:\\s?\\d{1,4}번?길)?)?` +
  `(?:\\s?\\d{1,5}(?:-\\d{1,5})?(?:번지)?(?!\\d))?` +
  ADDRESS_FLOOR;

const REGEX_RULES = [
  // 주민등록번호/외국인등록번호 YYMMDD-#######  (뒷자리 첫 숫자 1~8)
  { type: 'RRN', confidence: 0.99, regex: /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s]?[1-8]\d{6}(?!\d)/g },
  // 카드번호 4-4-4-4: 체크섬(Luhn)이 맞으면 확실, 틀려도 형식이 카드라 가리되 '확인 필요'
  // (붙여 쓴 숫자열은 rules-intl.mjs 에서 체크섬이 맞을 때만 잡는다)
  { type: 'CARD', confidence: 0.95, regex: /(?<!\d)(?:\d{4}[-\s]){3}\d{4}(?!\d)/g, filter: (v) => luhnValid(v.replace(/\D/g, '')) },
  { type: 'CARD', confidence: 0.7, uncertain: true, regex: /(?<!\d)(?:\d{4}[-\s]){3}\d{4}(?!\d)/g, filter: (v) => !luhnValid(v.replace(/\D/g, '')) },
  // 이메일
  { type: 'EMAIL', confidence: 0.98, regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 전화번호: 휴대폰(+82 포함), 지역번호 유선, 대표번호(1588-xxxx)
  {
    type: 'PHONE',
    confidence: 0.9,
    regex:
      /(?:\+82[-\s]?0?|(?<!\d)0)1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)|(?<!\d)0(?:2|[3-6][1-5])[-\s.)]?\d{3,4}[-\s.]?\d{4}(?!\d)|(?<!\d)1[5-9]\d{2}-\d{4}(?!\d)/g,
  },
  // 계좌번호: 하이픈으로 나뉜 숫자 묶음, 숫자 합계 10~14자리 (날짜·전화는 다른 규칙이 우선)
  {
    type: 'ACCOUNT',
    confidence: 0.6,
    regex: /(?<![\d-])\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,3})?(?![\d-])/g,
    filter: (v) => {
      const n = v.replace(/\D/g, '').length;
      return n >= 10 && n <= 14;
    },
  },
  // IPv4
  {
    type: 'IP',
    confidence: 0.85,
    regex: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g,
  },
  // 주소 ① 시·도로 시작: 경기도 성남시 분당구 판교역로 235 3층
  {
    type: 'ADDRESS',
    confidence: 0.8,
    regex: new RegExp(
      `(?<![가-힣])(?:${PROVINCES})(?:특별시|광역시|특별자치시|특별자치도|도|시)?` +
        `(?:(?:\\s[가-힣]{1,6}(?:시|군|구))+|(?=\\s[가-힣0-9]{1,12}(?:로|길)\\s?\\d))` +
        ADDRESS_TAIL,
      'g',
    ),
  },
  // 주소 ② 시·도 없이 시/군/구 + 도로명 + 번호: 분당구 판교역로 235
  {
    type: 'ADDRESS',
    confidence: 0.75,
    regex: new RegExp(
      `(?<![가-힣])[가-힣]{1,6}(?:시|군|구)(?:\\s[가-힣]{1,6}(?:시|군|구))*(?:\\s[가-힣0-9]{1,10}(?:읍|면|동|가|리))*` +
        `\\s[가-힣0-9]{1,12}(?:로|길)(?:\\s?\\d{1,4}번?길)?\\s?\\d{1,5}(?:-\\d{1,5})?(?!\\d)` +
        ADDRESS_FLOOR,
      'g',
    ),
  },
  // 주소 ③ 도로명 + 건물번호만: 테헤란로 123, 판교역로 235 (오탐 가능 → 확인 필요)
  {
    type: 'ADDRESS',
    confidence: 0.6,
    uncertain: true,
    regex: new RegExp(
      `(?<![가-힣])[가-힣0-9]{1,12}(?:대로|로|길)(?:\\s?\\d{1,4}번?길)?\\s\\d{1,5}(?:-\\d{1,5})?(?!\\d)` +
        `(?!\\s?(?:시|명|개|일|월|년|분|초|건|대|번째|차|회|%|곳|kg|원|만|억|위|등|배|살|세|주))` +
        ADDRESS_FLOOR,
      'g',
    ),
  },
  // 금액: $50,000 / 3억 2천만원 / 3,000만원 / 50000달러 / 1.5억
  {
    type: 'AMOUNT',
    confidence: 0.8,
    regex:
      /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[KMB]|억|만))?|(?<![\d,.])\d[\d,]*(?:\.\d+)?\s?(?:조|억)(?:\s?\d[\d,]*\s?(?:천만|백만|십만|만|천))?\s?(?:원|달러)?|(?<![\d,.])\d[\d,]*(?:\.\d+)?\s?(?:천만|백만|십만|만|천)?\s?(?:원|달러|USD|KRW|엔|위안|유로)/g,
  },
  // 날짜 (기본 꺼짐): 2026-03-05 / 2026.3.5 / 2026년 3월 5일 / 3월 5일
  {
    type: 'DATE',
    confidence: 0.65,
    regex: /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}|\d{4}년\s?\d{1,2}월(?:\s?\d{1,2}일)?|\d{1,2}월\s?\d{1,2}일/g,
  },
];

// ───────────────────────── 회사·기관명 ─────────────────────────

// 데모에서 안정적으로 잡히도록 넣어둔 기업명 사전 (완전한 목록 아님 → 사용자 사전으로 보완)
const KNOWN_ORGS = [
  '삼성전자', '삼성SDS', '삼성', 'LG전자', 'LG화학', 'LG', 'SK하이닉스', 'SK텔레콤', 'SK',
  '현대자동차', '현대모비스', '현대', '기아', '카카오뱅크', '카카오', '네이버', '쿠팡',
  '배달의민족', '우아한형제들', '토스', '비바리퍼블리카', '롯데', '한화', '포스코', 'KT',
  '신한은행', '국민은행', 'KB국민은행', '하나은행', '우리은행', '농협', '셀트리온',
  '구글', 'Google', '애플', 'Apple', '마이크로소프트', 'Microsoft', '아마존', 'Amazon',
  '메타', 'Meta', '테슬라', 'Tesla', '엔비디아', 'NVIDIA', 'OpenAI', 'Anthropic',
];

// 띄어쓰기 허용 접미어 (강한 신호)
const ORG_STRONG_SUFFIXES = [
  '주식회사', '홀딩스', '코퍼레이션', '테크놀로지스', '테크놀로지', '시스템즈', '솔루션즈',
  '인더스트리', '엔터프라이즈', '컴퍼니', '코리아',
];
// 붙여쓰기만 허용 접미어 (약한 신호)
const ORG_WEAK_SUFFIXES = [
  '전자', '건설', '제약', '은행', '증권', '캐피탈', '물산', '그룹', '랩스', '벤처스',
  '파트너스', '네트웍스', '엔터테인먼트', '모빌리티', '소프트', '웍스', '게임즈', '스튜디오',
  '테크', '텍', '랩', '바이오', '로지스틱스', '커머스', '미디어', '컨설팅',
];
// 이 말 뒤에 오는 단어는 회사명일 가능성이 높다 (경쟁사 라온소프트, 고객사 한빛)
const ORG_CONTEXT_WORDS = ['경쟁사', '고객사', '협력사', '거래처', '파트너사', '납품처', '발주처', '원청사', '하청사', '자회사', '모회사', '계열사', '투자사', '인수사'];
const ORG_CONTEXT_STOP = new Set([
  '확정', '미팅', '담당', '요청', '대상', '관리', '방문', '리스트', '목록', '입장', '미정', '선정',
  '대응', '확보', '발굴', '이탈', '분석', '조사', '현황', '대비', '수준', '전체', '모두', '측',
  '쪽', '들', '중', '대부분', '일부', '여러', '다수', '정보', '계약', '제안', '기준', '동향',
]);
// 약한 접미어 앞에 와도 회사명이 아닌 일반 단어
const ORG_GENERIC_PREFIX = new Set([
  '우리', '저희', '해당', '전체', '같은', '다른', '이번', '모든', '각', '중앙', '투자', '시중',
  '인터넷', '지방', '외국', '국내', '해외', '대형', '중소', '소속', '관계',
]);

// 부서·조직 단위로 끝나는 말 (회사명이 아님)
const ORG_UNIT_SUFFIX = /(?:팀|부|실|과|본부|센터|사업부|그룹장|담당)$/;

// ───────────────────────── 인명 ─────────────────────────

const SURNAMES = [
  '남궁', '황보', '선우', '제갈', '독고', '사공', '서문',
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황',
  '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하',
  '곽', '성', '차', '주', '우', '구', '민', '류', '나', '진', '지', '엄', '채', '원', '천', '방',
  '공', '현', '함', '변', '염', '여', '추', '도', '소', '석', '선', '설', '마', '길', '연', '위',
  '표', '명', '기', '반', '왕', '금', '옥', '육', '인', '맹', '제', '모', '탁', '국', '어', '은',
  '편', '용', '예', '경', '봉', '사', '부', '가', '복', '태', '목', '형', '피', '두', '감', '음',
];

const PERSON_TITLES = [
  '님', '씨', '선생님', '교수님', '교수', '대리', '과장', '차장', '부장', '팀장', '이사', '상무',
  '전무', '대표', '사원', '매니저', '실장', '본부장', '사장', '부사장', '회장', '주임', '책임',
  '선임', '수석', '연구원', '팀원', '프로', 'PM', 'PO', '변호사', '회계사', '고객님',
];

const PERSON_PARTICLES = [
  '이랑', '에게', '한테', '께서', '이가', '이는', '이를', '이와', '이의',
  '이', '가', '은', '는', '을', '를', '와', '과', '의', '께', '랑', '도', '만',
];

// 성씨로 시작하지만 사람 이름이 아닌 흔한 단어
const PERSON_STOPWORDS = new Set([
  '우리', '저희', '이번', '이것', '이런', '이후', '이전', '이유', '이해', '이상', '이하', '이미',
  '정도', '정말', '정리', '정확', '고객', '고민', '고려', '하나', '하지', '현재', '이야기', '한국',
  '중국', '미국', '일본', '전체', '전원', '전사', '주요', '주간', '주말', '오늘', '오전', '오후',
  '내일', '모두', '모든', '공식', '공통', '진행', '안건', '안내', '신규', '신청', '최종', '최근',
  '최대', '최소', '기존', '기본', '기획', '기술', '대표', '도입', '부서', '본부', '사업', '사내',
  '성과', '성능', '서비스', '연구', '연락', '연간', '예산', '예정', '위원', '유지', '인사', '인원',
  '장기', '단기', '조직', '조정', '차기', '차주', '추가', '추진', '표준', '하반기', '상반기',
  '한편', '함께', '해당', '현장', '홍보', '황금', '국내', '국외', '반영', '방안', '변경', '선정',
  '설명', '소개', '송부', '시장', '심사', '양측', '여러', '연휴', '원래', '원가', '육성', '임원',
  '경영', '경쟁', '공유', '공급', '구매', '구조', '권한', '노력', '도출', '명확', '문의', '문제',
  '민감', '배포', '백업', '분기', '사장', '서류', '석달', '선택', '손익', '수정', '심화', '안정',
  '어제', '엄격', '오류', '왕복', '용역', '우선', '원칙', '위험', '유사', '은행', '인증', '임시',
  '제안', '제품', '조건', '주문', '지원', '지난', '진척', '채용', '천천', '추후', '탁월', '태도',
  '편의', '피드백', '하루', '한번', '함수', '허용', '형태', '홈페이지', '마감', '마케팅', '명단',
  // 성씨 글자로 시작하는 3음절 일반 명사 (조사 패턴 오탐 방지)
  '배송지', '소재지', '거주지', '목적지', '출발지', '도착지', '수신지', '발송지', '근무지', '여행지',
  '관광지', '부지', '주소지', '주문서', '견적서', '보고서', '신청서', '이력서', '설명서', '기획서',
  '제안서', '명세서', '안내서', '확인서', '동의서', '의뢰서', '청구서', '사업자', '이용자', '사용자',
  '신청자', '지원자', '구매자', '소비자', '기여자', '주최자', '방문자', '가입자', '수신자', '작성자',
  '편집자', '전문가', '전문성', '사용성', '안정성', '보안성', '가용성', '정합성', '서비스', '시스템',
  '사이트', '서버가', '하드웨어', '소프트웨어', '데이터', '마이그레이션', '이메일', '공지사항',
  '최우선', '최적화', '고도화', '정상화', '자동화', '표준화', '구체화', '사전에', '하자가', '재고가',
  '도면이', '노트북', '모니터', '키보드', '태블릿', '프린터',
  // "이름은 나중에", "담당자는 미정" 처럼 소개하는 말 뒤에 오는 일반 표현
  '나중에', '나중', '아직', '미정', '미정이', '추후', '추후에', '비공개', '없음', '모름', '공석',
  // 원·선으로 끝나는 일반 명사 (원·선은 이름 끝 글자로도 흔해서 끝말 규칙 대신 단어로 막는다)
  '공무원', '사무원', '구성원', '전산원', '감정원', '조사원', '경비원', '정비원', '전용선', '신규선', '우회선', '고속선', '전화선',
]);

// 2음절 이름 + 조사 패턴에서, 이 글자로 끝나면 사람 이름보다 일반 명사일 가능성이 큼
const NOUN_ENDINGS = new Set([
  '사', '도', '표', '품', '율', '률', '액', '량', '료', '점', '국', '팀', '부', '과', '실', '처',
  '관', '소', '적', '식', '법', '력', '체', '물', '계', '건', '별', '층', '형', '망', '업', '단',
  '회', '비', '장', '청', '안', '권', '로', '일', '월', '년',
  // 동사·형용사 어간 (사용하는 → "사용하", 진행되는 → "진행되" 를 이름으로 잡지 않도록)
  '하', '되', '해', '했', '된', '할', '함', '히', '있', '없', '같', '됨', '됐', '봤', '왔', '갔',
]);

// 이름 바로 뒤에 붙는 서술격 조사·어미: 김민수이고, 김민수이며, 김민수입니다
const PERSON_COPULAS = ['이고요', '이고', '이며', '입니다', '이에요', '이었', '이라고', '이라는', '이시고', '이시며', '이세요', '이구요'];
const PERSON_COPULAS_END = ['이다', '였다']; // 뒤에 한글이 더 붙지 않을 때만

// "저는 김민수", "담당자는 김민수" — 이런 말 바로 뒤에는 이름이 올 가능성이 높다
const PERSON_INTRO_WORDS = [
  '저는', '전', '제 이름은', '제이름은', '이름은', '성함은', '성명은', '성명', '이름', '본인은',
  '담당자는', '담당자', '담당은', '작성자는', '발표자는', '보고자는', '신청자는', '문의는', '연락처는',
];

// 회사명 뒤에 붙은 조사를 떼어낼 때 사용
const TRAILING_PARTICLES = [
  '으로', '에서', '에게', '한테', '까지', '부터', '이나', '이랑', '하고', '와의', '과의',
  '은', '는', '이', '가', '을', '를', '와', '과', '의', '도', '만', '로', '랑', '에',
];

// ───────────────────────── 유틸 ─────────────────────────

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAsciiWordChar = (ch) => !!ch && /[A-Za-z0-9_]/.test(ch);

function trimTrailingParticles(text, minLength = 2) {
  let result = text;
  let changed = true;
  while (changed && result.length > minLength) {
    changed = false;
    for (const p of TRAILING_PARTICLES) {
      if (result.endsWith(p) && result.length - p.length >= minLength) {
        result = result.slice(0, -p.length);
        changed = true;
        break;
      }
    }
  }
  return result;
}

/**
 * text 안에서 word 가 나오는 모든 위치. 영문/숫자로 된 단어는 앞뒤가 영문/숫자이면 건너뛴다
 * (예: 'SK' 가 'TASK' 안에서 잡히지 않도록).
 */
export function findAllOccurrences(text, word) {
  const out = [];
  if (!word) return out;
  const asciiStart = isAsciiWordChar(word[0]);
  const asciiEnd = isAsciiWordChar(word[word.length - 1]);
  let idx = 0;
  while ((idx = text.indexOf(word, idx)) !== -1) {
    const end = idx + word.length;
    const badStart = asciiStart && isAsciiWordChar(text[idx - 1]);
    const badEnd = asciiEnd && isAsciiWordChar(text[end]);
    if (!badStart && !badEnd) out.push([idx, end]);
    idx = end;
  }
  return out;
}

const det = (type, start, end, text, source, confidence, extra = {}) => ({
  type,
  value: text.slice(start, end),
  start,
  end,
  source,
  confidence,
  ...extra,
});

// ───────────────────────── 탐지 패스 ─────────────────────────

function detectByRegex(text) {
  const out = [];
  for (const rule of [...REGEX_RULES, ...INTL_REGEX_RULES]) {
    rule.regex.lastIndex = 0;
    let m;
    while ((m = rule.regex.exec(text)) !== null) {
      let value = m[0];
      if (!value) {
        rule.regex.lastIndex++;
        continue;
      }
      // 끝의 공백 제거
      value = value.replace(/\s+$/, '');
      if (rule.filter && !rule.filter(value)) continue;
      out.push(det(rule.type, m.index, m.index + value.length, text, 'regex', rule.confidence, rule.uncertain ? { uncertain: true } : {}));
    }
  }
  return out;
}

function detectKnownOrgs(text) {
  const out = [];
  for (const org of [...KNOWN_ORGS].sort((a, b) => b.length - a.length)) {
    for (const [s, e] of findAllOccurrences(text, org)) out.push(det('ORG', s, e, text, 'known-org', 0.9));
  }
  return out;
}

function detectOrgBySuffix(text) {
  const out = [];
  let m;

  // ㈜ / (주) / 주식회사 접두 형태 — 접두어는 남기고 회사 이름만 가린다.
  // (값에 ㈜까지 넣으면, 뒤에 ㈜ 없이 다시 나오는 "한빛테크"를 놓치게 된다)
  // "블루오션랩 주식회사 구매팀" 처럼 주식회사가 앞 이름의 접미어인 경우는 제외한다.
  const prefix = /(㈜|\(주\)|(?<![가-힣A-Za-z0-9]\s?)주식회사\s)\s?([가-힣A-Za-z0-9]{1,12})/g;
  while ((m = prefix.exec(text)) !== null) {
    const core = trimTrailingParticles(m[2]);
    const start = m.index + m[0].length - m[2].length;
    if (core.length < 2 && !/[A-Za-z0-9]/.test(core)) continue;
    if (ORG_UNIT_SUFFIX.test(core)) continue; // 구매팀, 영업본부 같은 부서명
    out.push(det('ORG', start, start + core.length, text, 'org-suffix', 0.88));
  }

  // OO주식회사 / OO 홀딩스 (띄어쓰기 허용) — "OO"만 따로 나와도 찾도록 variants 에 넣는다.
  const strongAlt = ORG_STRONG_SUFFIXES.map(escapeRegExp).join('|');
  const strong = new RegExp(`(?<![가-힣A-Za-z0-9])([가-힣A-Za-z0-9]{1,12}?)\\s?(?:${strongAlt})`, 'g');
  while ((m = strong.exec(text)) !== null) {
    const head = m[1];
    if (ORG_GENERIC_PREFIX.has(head)) continue;
    const variants = head.length >= 2 ? [head] : [];
    out.push(det('ORG', m.index, m.index + m[0].length, text, 'org-suffix', 0.85, { variants }));
  }

  // OO전자 / OO증권 / 라온소프트 (붙여쓰기만, 뒤에 조사는 허용)
  const particleAlt = [...TRAILING_PARTICLES].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const weakAlt = [...ORG_WEAK_SUFFIXES].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const weak = new RegExp(
    `(?<![가-힣A-Za-z0-9])([가-힣A-Za-z0-9]{2,10}?)(?:${weakAlt})(?=(?:${particleAlt})?(?![가-힣]))`,
    'g',
  );
  while ((m = weak.exec(text)) !== null) {
    if (ORG_GENERIC_PREFIX.has(m[1])) continue;
    out.push(det('ORG', m.index, m.index + m[0].length, text, 'org-suffix', 0.7, { uncertain: true }));
  }

  // 문맥: "경쟁사 라온", "고객사인 블루랩" 뒤의 단어
  const ctx = new RegExp(
    `(?<=(?:${ORG_CONTEXT_WORDS.join('|')})(?:인|로|이자)?\\s)([가-힣A-Za-z0-9&]{2,15})(?=(?:${particleAlt})?(?![가-힣A-Za-z0-9]))`,
    'g',
  );
  while ((m = ctx.exec(text)) !== null) {
    const name = trimTrailingParticles(m[1]);
    if (ORG_CONTEXT_STOP.has(name) || ORG_GENERIC_PREFIX.has(name) || name.length < 2) continue;
    if (/^\d+$/.test(name)) continue;
    out.push(det('ORG', m.index, m.index + name.length, text, 'org-context', 0.65, { uncertain: true }));
  }

  return out;
}

function detectPersons(text) {
  const surname = SURNAMES.join('|');
  const titles = [...PERSON_TITLES].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const particles = [...PERSON_PARTICLES].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const out = [];
  let m;

  // ① 성+이름(1~2자) 뒤에 (공백 후) 직함/존칭 — 신뢰도 높음
  const byTitle = new RegExp(`(?<![가-힣])(?:${surname})[가-힣]{1,2}(?=\\s?(?:${titles}))`, 'g');
  while ((m = byTitle.exec(text)) !== null) {
    if (PERSON_STOPWORDS.has(m[0])) continue;
    out.push(det('PERSON', m.index, m.index + m[0].length, text, 'person-title', 0.85));
  }

  // ② 성+정확히 2음절 이름 뒤에 조사가 바로 붙는 경우 — 오탐이 많아 uncertain 표시
  const byParticle = new RegExp(`(?<![가-힣])(?:${surname})[가-힣]{2}(?=(?:${particles})(?![가-힣]))`, 'g');
  while ((m = byParticle.exec(text)) !== null) {
    const v = m[0];
    if (PERSON_STOPWORDS.has(v) || PERSON_STOPWORDS.has(v.slice(0, 2))) continue;
    if (NOUN_ENDINGS.has(v[v.length - 1])) continue;
    out.push(det('PERSON', m.index, m.index + v.length, text, 'person-particle', 0.55, { uncertain: true }));
  }

  // ②-1 성+2음절 이름 뒤에 서술격 조사: "김민수이고", "김민수입니다", "김민수이며"
  const copulas = [...PERSON_COPULAS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const copulasEnd = PERSON_COPULAS_END.map(escapeRegExp).join('|');
  const byCopula = new RegExp(`(?<![가-힣])(?:${surname})[가-힣]{2}(?=${'(?:'}${copulas})|(?:${copulasEnd})(?![가-힣]))`, 'g');
  while ((m = byCopula.exec(text)) !== null) {
    const v = m[0];
    if (PERSON_STOPWORDS.has(v) || PERSON_STOPWORDS.has(v.slice(0, 2))) continue;
    if (NOUN_ENDINGS.has(v[v.length - 1])) continue;
    out.push(det('PERSON', m.index, m.index + v.length, text, 'person-copula', 0.6, { uncertain: true }));
  }

  // ②-2 "저는 김민수이고", "담당자는 김민수이며", "이름: 김민수" — 소개하는 말 바로 뒤의 성명
  const intro = PERSON_INTRO_WORDS.map((w) => escapeRegExp(w).replace(/ /g, '\\s?')).join('|');
  const nameEnd = [...PERSON_COPULAS, ...PERSON_COPULAS_END, '예요', '님', '씨', ...PERSON_PARTICLES]
    .sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const byIntro = new RegExp(
    // 소개하는 말 뒤에는 띄어쓰기나 콜론이 있어야 한다 ("전용선" 의 "전" 이 소개 말로 읽히지 않도록)
    `(?<=(?<![가-힣])(?:${intro})(?:\\s+|\\s*[:：]\\s*))(?:${surname})[가-힣]{1,2}(?=(?:${nameEnd})|[\\s,.)!?。]|$)`,
    'g',
  );
  while ((m = byIntro.exec(text)) !== null) {
    if (PERSON_STOPWORDS.has(m[0]) || PERSON_STOPWORDS.has(m[0].slice(0, 2))) continue;
    out.push(det('PERSON', m.index, m.index + m[0].length, text, 'person-intro', 0.8));
  }

  // ③ "참석: 김철수, 박지영" 같은 이름 나열 — 콜론/쉼표 사이의 3음절 성명
  const list = new RegExp(`(?<=(?:참석자?|담당자?|작성자?|발표자?|연락처|수신|참조|from|to|cc)\\s*[:：]\\s*(?:[^\\n]*?[,，·]\\s*)?)(?:${surname})[가-힣]{2}(?![가-힣])`, 'gi');
  while ((m = list.exec(text)) !== null) {
    if (PERSON_STOPWORDS.has(m[0])) continue;
    out.push(det('PERSON', m.index, m.index + m[0].length, text, 'person-list', 0.8));
  }

  return out;
}

function detectByDictionary(text, dictionary = {}) {
  const out = [];
  for (const [rawType, words] of Object.entries(dictionary)) {
    const type = rawType.toUpperCase();
    for (const word of [...(words || [])].sort((a, b) => b.length - a.length)) {
      const w = String(word).trim();
      // 사용자가 직접 지정한 단어는 어떤 규칙보다 우선한다 (예: URL 전체를 넣었는데 이메일 규칙이 일부만 가져가면 안 됨)
      for (const [s, e] of findAllOccurrences(text, w)) out.push(det(type, s, e, text, 'dictionary', 1.0));
    }
  }
  return out;
}

/**
 * NER 결과({type, start, end, score})를 표준 탐지 형식으로 바꾼다.
 * 원본 VeilNote backend tokenizer.js 의 nerToDetections 와 같은 역할.
 * NER 은 규칙이 놓친 빈자리를 채우는 용도라 모든 규칙보다 신뢰도를 낮게 둔다.
 * (규칙이 "北京市朝阳区建国路88号" 전체를 잡았는데 NER 이 "北京市"만 잡아서 이기면 "88号"가 새기 때문)
 * 점수가 낮거나, TASK 처럼 대문자만으로 된 짧은 단어는 '확인 필요'로 표시한다.
 */
function nerToDetections(text, entities = []) {
  const out = [];
  for (const e of entities) {
    if (e.start == null || e.end == null || e.end <= e.start) continue;
    const value = text.slice(e.start, e.end);
    if (!value.trim()) continue;
    const shoutyWord = /^[A-Z0-9]{2,6}$/.test(value);
    const sure = (e.score ?? 0) >= 0.85 && !shoutyWord;
    out.push(det(e.type, e.start, e.end, text, 'ner', sure ? 0.5 : 0.45, sure ? {} : { uncertain: true }));
  }
  return out;
}

// ───────────────────────── 합치기 ─────────────────────────

/** 겹치는 탐지는 신뢰도 높은 것 → 더 긴 것 순으로 남긴다. */
export function resolveOverlaps(detections) {
  const sorted = [...detections].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.end - b.start - (a.end - a.start);
  });
  const kept = [];
  for (const d of sorted) {
    if (!kept.some((k) => d.start < k.end && k.start < d.end)) kept.push(d);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * 한 번 민감정보로 확정된 값은 문서 전체에서 다시 찾아 모두 가린다.
 * 예: "김철수 팀장"으로 잡힌 뒤 "김철수랑" 처럼 패턴에 안 걸리는 곳도 가려져야 유출이 없다.
 */
function propagate(text, detections) {
  const seen = new Map();
  for (const d of detections) {
    const key = `${d.type}:${d.value}`;
    if (!seen.has(key) || seen.get(key).confidence < d.confidence) seen.set(key, d);
  }
  const extra = [];
  for (const d of seen.values()) {
    for (const word of [d.value, ...(d.variants || [])]) {
      // variant: 확실한 탐지에서 나온 부분 이름(성만, ㈜ 없는 회사명)이라 원래 탐지의 확실도를 따른다
      const source = word === d.value ? 'propagate' : 'variant';
      for (const [s, e] of findAllOccurrences(text, word)) {
        extra.push(det(d.type, s, e, text, source, d.confidence - 0.01, d.uncertain ? { uncertain: true } : {}));
      }
    }
  }
  return resolveOverlaps([...detections, ...extra]);
}

/**
 * 전체 탐지.
 * @param {string} text
 * @param {{ types?: string[], dictionary?: Record<string,string[]>, allow?: string[] }} opts
 *   types: 켤 탐지 종류 (기본 DEFAULT_TYPES). 사용자 사전의 종류는 항상 켜진다.
 *   dictionary: { ORG: ['한빛테크'], PERSON: ['소지윤'], PROJECT: ['코드명 블루'] } — 임의 종류명 가능
 *   allow: 절대 가리지 않을 단어 목록 (오탐 제외용)
 *   ner: ner.mjs 의 runNer() 가 미리 계산한 개체 목록 (선택). 규칙과 똑같이 합쳐진다.
 */
export function detect(text, { types = DEFAULT_TYPES, dictionary = {}, allow = [], ner = [] } = {}) {
  const enabled = new Set([...types.map((t) => t.toUpperCase()), ...Object.keys(dictionary).map((t) => t.toUpperCase())]);
  const allowSet = new Set(allow.map((a) => a.trim()).filter(Boolean));

  const raw = [
    ...detectByRegex(text),
    ...detectKnownOrgs(text),
    ...detectOrgBySuffix(text),
    ...detectPersons(text),
    ...detectIntlOrgs(text),
    ...detectIntlPersons(text),
    ...detectSecrets(text),
    ...detectStructured(text),
    ...nerToDetections(text, ner),
    ...detectByDictionary(text, dictionary),
  ].filter((d) => enabled.has(d.type) && !allowSet.has(d.value));

  // allow 단어 영역은 아예 탐지 대상에서 빼서, 그 안의 일부분도 잡히지 않게 한다.
  const allowRanges = [...allowSet].flatMap((w) => findAllOccurrences(text, w));
  const notInAllowed = (d) => !allowRanges.some(([s, e]) => d.start >= s && d.end <= e);

  const resolved = resolveOverlaps(raw.filter(notInAllowed));
  return propagate(text, resolved).filter(notInAllowed).filter((d) => !allowSet.has(d.value));
}

/**
 * 화면·로그용 마스킹: 첫 글자만 남긴다. 김철수 → 김**, chulsoo@x.com → c*******
 * (가운데 글자만 가리는 방식은 3글자 이름에서 2글자가 드러나므로 쓰지 않는다)
 */
export function maskValue(value) {
  const chars = [...(value || '')];
  if (chars.length === 0) return '';
  return chars[0] + '*'.repeat(Math.min(Math.max(chars.length - 1, 1), 8));
}
