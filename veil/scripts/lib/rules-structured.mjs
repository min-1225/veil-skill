// 구조화된 데이터 속 민감정보 — CSV·TSV·마크다운 표의 열, JSON·YAML 의 키, "라벨 다음 줄" 값
//
// 문장 속 이름은 직함·조사·소개 표현으로 찾지만, 표·데이터 안의 이름은 그런 단서가 없다.
// 대신 열 이름이나 키("이름", "담당자", "name", "customer" …)가 강한 단서이므로 그 값을 가린다.
// 성씨 목록에 기대지 않아서 "John Smith", "Kim Minsu" 같은 이름도 잡힌다.

const norm = (s) => s.toLowerCase().replace(/["'`*_\-\s:：()（）[\]]/g, '');

// 사람 이름이 들어가는 열·키 (정규화한 형태)
const PERSON_KEYS_SPECIFIC = new Set([
  '이름', '성명', '성함', '고객명', '담당자명', '대표자', '대표자명', '직원명', '사원명', '회원명', '환자명',
  '학생명', '보호자', '보호자명', '수신자', '발신자', '신청자', '예약자', '참석자', '작성자', '보고자', '담당자',
  '실명', '한글이름', '영문이름', '성명한글', '성명영문',
  '수령인', '수취인', '접속자', '내담자', '예금주', '여행자', '책임자', '결제자', '출장자', '의뢰인', '계약자',
  '가입자', '피보험자', '구매자', '주문자', '상담사', '진행자', '이용자명', '사용자명',
  'fullname', 'firstname', 'lastname', 'givenname', 'familyname', 'surname', 'customername', 'clientname',
  'contactname', 'employeename', 'patientname', 'studentname', 'recipientname', 'sendername', 'personname',
  'realname', 'legalname', 'displayname',
]);
// 일반적인 키 — 설정 파일에도 흔해서, 값이 사람 이름처럼 생겼을 때만 가린다
const PERSON_KEYS_GENERIC = new Set([
  'name', '고객', '담당', '대표', '직원', '회원', '환자', '학생',
  'customer', 'client', 'contact', 'owner', 'assignee', 'employee', 'manager', 'author', 'recipient',
  'sender', 'patient', 'person', 'reporter', 'requester', 'reviewer', 'approver', 'attendee', 'member',
]);
const ORG_KEYS = new Set([
  '회사', '회사명', '업체', '업체명', '거래처', '거래처명', '고객사', '상호', '상호명', '기관', '기관명', '소속',
  '소속회사', '법인명', '협력사', '공급사', '발주처', '납품처',
  'company', 'companyname', 'organization', 'organisation', 'org', 'orgname', 'vendor', 'employer',
  'supplier', 'account', 'accountname', 'firm', 'business', 'businessname',
]);
const ADDRESS_KEYS = new Set([
  '주소', '배송지', '배송주소', '거주지', '소재지', '주소지', '자택주소', '회사주소', '도로명주소', '지번주소',
  'address', 'addr', 'streetaddress', 'street', 'shippingaddress', 'billingaddress', 'homeaddress', 'mailingaddress',
]);

// 번호·비밀값 열 — 값 형식이 제각각이라 열 이름이 가장 확실한 단서다
const VALUE_KEYS = {
  EMPLOYEE_ID: [
    '사번', '사원번호', '직원번호', '고객번호', '회원번호', '회원id', '회원아이디', '상담번호', '사례번호', '사례id',
    '접수번호', '환자번호', '학번', '예약번호', 'employeeid', 'empid', 'staffid', 'customerid', 'clientid',
    'memberid', 'caseid', 'patientid', 'studentid', 'customerno', 'memberno',
  ],
  ACCOUNT: ['계좌', '계좌번호', '입금계좌', '환급계좌', '출금계좌', 'accountnumber', 'accountno', 'bankaccount', 'iban'],
  AMOUNT: [
    '금액', '계약금', '견적', '견적가', '견적금액', '환급액', '환급금', '결제액', '결제금액', '잔액', '연봉', '급여',
    '보증금', '정산액', '청구액', 'amount', 'salary',
  ],
  SECRET: [
    '비밀번호', '암호', '패스워드', '토큰', '임시토큰', '인증토큰', 'api키', 'apikey', 'token', 'password', 'passwd',
    'secret', 'accesstoken', 'apitoken',
  ],
  PASSPORT: ['여권번호', '여권', 'passport', 'passportno', 'passportnumber'],
  RRN: ['주민번호', '주민등록번호', '외국인등록번호'],
};
const VALUE_KEY_TYPE = new Map(Object.entries(VALUE_KEYS).flatMap(([type, keys]) => keys.map((k) => [k, type])));

function keyInfo(raw) {
  const k = norm(raw);
  if (!k) return null;
  if (PERSON_KEYS_SPECIFIC.has(k)) return { type: 'PERSON', generic: false };
  if (PERSON_KEYS_GENERIC.has(k)) return { type: 'PERSON', generic: true };
  if (ORG_KEYS.has(k)) return { type: 'ORG' };
  if (ADDRESS_KEYS.has(k)) return { type: 'ADDRESS' };
  if (VALUE_KEY_TYPE.has(k)) return { type: VALUE_KEY_TYPE.get(k) };
  return null;
}

/** 번호·비밀값 열의 값이 그 종류로 쓸 만한가 */
function plausibleValue(type, v) {
  if (v.length > 100) return false;
  const digits = (v.match(/\d/g) || []).length;
  switch (type) {
    case 'EMPLOYEE_ID': return digits >= 2 && !/\s/.test(v);
    case 'ACCOUNT': return digits >= 8;
    // 통화 표시나 천 단위 쉼표가 있거나 큰 숫자일 때만 (amount 열의 "100" 같은 일반 수치는 남긴다)
    case 'AMOUNT': return digits >= 1 && (/[원$€£¥₩]|달러|만|억|,\d{3}/.test(v) || digits >= 5);
    case 'SECRET': return v.length >= 4 && !/\s/.test(v);
    case 'PASSPORT': return digits >= 6 && v.length <= 12;
    case 'RRN': return digits === 13;
    default: return true;
  }
}

const PLACEHOLDER = /^(?:-+|—+|n\/?a|null|none|nil|tbd|tba|unknown|undefined|\?+|x+|없음|미정|미기재|해당\s?없음|비공개|공석|모름|미상|익명)$/i;
const ORG_HINT = /㈜|\(주\)|주식회사|유한회사|(?:^|\s)(?:Inc|Corp|Ltd|LLC|GmbH|Co)\.?$|회사$|그룹$|은행$|株式会社|有限公司/;

/** 값이 사람 이름처럼 생겼는가 (generic 키일 때는 더 엄격하게) */
function looksLikePerson(v, generic) {
  if (/[0-9@/\\_#=<>{}[\]]/.test(v)) return false;
  if (/^[가-힣]{2,5}$/.test(v)) return true; // 김민수, 남궁민수
  if (/^[가-힣]{1,2}\s[가-힣]{1,3}$/.test(v)) return true; // 김 민수
  if (/^[一-龥]{2,4}$/.test(v)) return true; // 王伟, 山田太郎
  if (/^[一-龥ぁ-んァ-ヶー]{1,5}[\s・][一-龥ぁ-んァ-ヶー]{1,5}$/.test(v)) return true; // 山田 太郎
  // "Smith, John" 처럼 성, 이름 순서로 쉼표가 들어간 경우도 받는다
  const words = v.split(/,?\s+/);
  const latinWord = /^[A-Za-z][A-Za-z'.]*(?:-[A-Za-z][A-Za-z'.]*)?$/;
  if (words.length >= 2 && words.length <= 4 && words.every((w) => latinWord.test(w))) {
    // "John Smith", "Kim Minsu", "kim minsu" — 단, 전부 소문자이고 하이픈으로 이어진 패키지명 같은 건 제외
    return !words.every((w) => /^[a-z-]+$/.test(w)) || !generic;
  }
  // 대문자로 시작하는 한 단어 (Sarah) — 이름 전용 열(firstName 등)에서만
  if (!generic && words.length === 1 && /^[A-Z][a-z]+(?:-[A-Z][a-z]+)?$/.test(v)) return true;
  return false;
}

/** 칸의 원래 범위 [s, e) 에서 공백·따옴표를 걷어내고, 값이 쓸 만하면 탐지 하나를 만든다 */
function cellDetection(text, s, e, info) {
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (e - s >= 2 && /["']/.test(text[s]) && text[e - 1] === text[s]) { s++; e--; }
  let value = text.slice(s, e);
  if (info.type === 'PERSON') {
    // "Jane Doe <jane@x.com>", "김민수 (VIP)" → 이름 부분만
    const cut = value.search(/\s*[<(（]/);
    if (cut > 0) { e = s + cut; value = value.slice(0, cut); }
  }
  if (!value || PLACEHOLDER.test(value)) return null;
  let type = info.type;
  if (type === 'PERSON') {
    if (ORG_HINT.test(value)) type = 'ORG';
    else if (value.length > 40 || !looksLikePerson(value, info.generic)) return null;
  }
  if (type === 'ORG' && (value.length > 60 || /^[\d\s.,-]+$/.test(value) || /[@/\\]/.test(value))) return null;
  if (type === 'ADDRESS' && (value.length < 4 || value.length > 150)) return null;
  if (VALUE_KEYS[type] && !plausibleValue(type, value)) return null;
  // 번호류는 형식 규칙(전화 0.9, 이메일 0.98)보다 낮고, 금액·계좌 규칙(0.8, 0.6)보다는 높게 둔다
  const confidence = type === 'PERSON' ? 0.86 : type === 'ORG' ? 0.87 : VALUE_KEYS[type] ? 0.85 : 0.82;
  return { type, value, start: s, end: e, source: 'structured', confidence };
}

/** 구분자로 한 줄을 칸으로 나눈다. 큰따옴표 안의 구분자는 무시한다. 반환: [[시작, 끝], …] (줄 기준) */
function splitCells(line, delim) {
  const cells = [];
  let start = 0;
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    else if (line[i] === delim && !inQuote) {
      cells.push([start, i]);
      start = i + 1;
    }
  }
  cells.push([start, line.length]);
  if (delim === '|') {
    // 마크다운 표: 맨 앞·맨 뒤 '|' 바깥의 빈 칸은 버린다
    if (cells.length && !line.slice(...cells[0]).trim()) cells.shift();
    if (cells.length && !line.slice(...cells[cells.length - 1]).trim()) cells.pop();
  }
  return cells;
}

/**
 * 따옴표 없이 쓴 금액의 천 단위 쉼표 때문에 칸이 늘어난 CSV 줄을 되돌린다.
 *   업체,담당자,견적  /  다온,김민수,18,700,000원  → "18" "700" "000원" 을 한 칸으로 합친다
 * 합쳐서 머리줄과 칸 수가 같아질 때만 받아들인다.
 */
function mergeThousands(line, cells, target) {
  const out = cells.map((c) => [...c]);
  const txt = ([s, e]) => line.slice(s, e).trim();
  let changed = true;
  while (out.length > target && changed) {
    changed = false;
    for (let i = 0; i + 1 < out.length; i++) {
      if (/^[-+$₩]?\d{1,3}(?:,\d{3})*$/.test(txt(out[i])) && /^\d{3}(?:\D.*)?$/.test(txt(out[i + 1]))) {
        out.splice(i, 2, [out[i][0], out[i + 1][1]]);
        changed = true;
        break;
      }
    }
  }
  return out.length === target ? out : cells;
}

const isMdSeparator =(line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

function linesOf(text) {
  const out = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    out.push({ line, start: pos });
    pos += raw.length + 1;
  }
  return out;
}

/** CSV·TSV·세미콜론 구분·마크다운 표 */
function detectTables(text, lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const { line } = lines[i];
    for (const delim of ['|', '\t', ',', ';']) {
      if (!line.includes(delim)) continue;
      const header = splitCells(line, delim);
      if (header.length < 2) continue;
      const infos = header.map(([s, e]) => keyInfo(line.slice(s, e)));
      if (!infos.some(Boolean)) continue;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const row = lines[j];
        if (!row.line.trim()) break;
        if (delim === '|' && isMdSeparator(row.line)) continue;
        let cells = splitCells(row.line, delim);
        if (cells.length > header.length && delim === ',') cells = mergeThousands(row.line, cells, header.length);
        if (cells.length !== header.length) break;
        cells.forEach(([s, e], k) => {
          if (!infos[k]) return;
          const d = cellDetection(text, row.start + s, row.start + e, infos[k]);
          if (d) out.push(d);
        });
      }
      i = j - 1;
      break;
    }
  }
  return out;
}

/** JSON "키": "값" */
function detectJsonPairs(text) {
  const out = [];
  const re = /"([^"\\\n]{1,40})"\s*:\s*"((?:[^"\\\n]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const info = keyInfo(m[1]);
    if (!info) continue;
    const vStart = m.index + m[0].length - 1 - m[2].length;
    const d = cellDetection(text, vStart, vStart + m[2].length, info);
    if (d) out.push(d);
  }
  return out;
}

/** YAML·INI·"키: 값" 한 줄, 그리고 라벨만 있는 줄 다음 줄의 값 */
function detectKeyValueLines(text, lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const { line, start } = lines[i];
    const kv = /^([ \t]*(?:-[ \t]+)?)([A-Za-z가-힣][A-Za-z가-힣 _-]{0,29}?)[ \t]*[:=：][ \t]*(\S.*?)[ \t]*$/.exec(line);
    if (kv) {
      const info = keyInfo(kv[2]);
      if (info && !/^[[{]/.test(kv[3])) {
        // 값은 줄 끝 공백 바로 앞에서 끝난다
        const valueEnd = line.replace(/[ \t]+$/, '').length;
        const s = start + valueEnd - kv[3].length;
        const d = cellDetection(text, s, s + kv[3].length, info);
        if (d) out.push(d);
      }
      continue;
    }
    // "보고자" 한 줄, 다음 줄에 "김민수"
    const label = /^[ \t]*([A-Za-z가-힣][A-Za-z가-힣 _-]{0,29}?)[ \t]*[:：]?[ \t]*$/.exec(line);
    if (label && keyInfo(label[1]) && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (next.line.trim() && next.line.trim().length <= 40) {
        const d = cellDetection(text, next.start, next.start + next.line.length, keyInfo(label[1]));
        if (d) out.push(d);
      }
    }
  }
  return out;
}

export function detectStructured(text) {
  const lines = linesOf(text);
  return [...detectTables(text, lines), ...detectJsonPairs(text), ...detectKeyValueLines(text, lines)];
}
