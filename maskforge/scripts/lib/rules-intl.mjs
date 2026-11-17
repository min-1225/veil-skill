// 다국어 탐지 규칙 — 언어 무관 형식 패턴 + 영어·일본어·중국어 휴리스틱
// 한국어 규칙은 detect.mjs 에 있다. 여기 규칙은 detect.mjs 가 함께 불러 쓴다.

// ───────────── 검증 함수 ─────────────

/** 카드번호 체크섬(Luhn). 아무 16자리 숫자를 카드로 오인하지 않기 위해 쓴다. */
export function luhnValid(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** IBAN 체크섬 (mod 97) */
export function ibanValid(raw) {
  const s = raw.replace(/\s/g, '').toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of v) rem = (rem * 10 + (c.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

const digitCount = (v) => v.replace(/\D/g, '').length;

// ───────────── 언어 무관 + 다국어 정규식 규칙 ─────────────

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const US_STREET = 'Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Boulevard|Blvd\\.?|Lane|Ln\\.?|Drive|Dr\\.?|Way|Court|Ct\\.?|Place|Pl\\.?|Terrace|Parkway|Pkwy\\.?|Highway|Hwy\\.?|Square|Sq\\.?';
const JP_PREF = '東京都|北海道|(?:京都|大阪)府|[一-龥]{2,3}県';
const CJK = '一-龥ぁ-んァ-ヶー';

export const INTL_REGEX_RULES = [
  // ── 신분번호 ──
  // 미국 SSN 123-45-6789 (발급되지 않는 000, 666, 9xx 제외)
  { type: 'SSN', confidence: 0.9, regex: /(?<![\d-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\d-])/g },
  // 여권번호: "passport / 여권 / パスポート / 护照" 같은 말 바로 뒤에 올 때만
  {
    type: 'PASSPORT',
    confidence: 0.95,
    regex: /(?<=(?:passport|여권|旅券|パスポート|护照|護照)(?:\s?(?:no\.?|number|num|#|번호|番号|号码|號碼))?\s?[:：]?\s?)[A-Z]{0,2}\d{6,9}(?![A-Za-z0-9])/gi,
  },

  // ── 금융 ──
  // 카드번호: 13~19자리, 체크섬(Luhn)이 맞을 때만 (4-4-4-4 형식은 detect.mjs 가 따로 잡는다)
  {
    type: 'CARD',
    confidence: 0.9,
    regex: /(?<![\d-])[2-6]\d{3}(?:[ -]?\d){9,15}(?![\d-])/g,
    filter: (v) => {
      const d = v.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 19 && luhnValid(d);
    },
  },
  // IBAN (유럽 등 국제 계좌번호) — 체크섬 검증
  {
    type: 'ACCOUNT',
    confidence: 0.95,
    regex: /(?<![A-Z0-9])[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?(?![A-Z0-9])/g,
    filter: ibanValid,
  },
  // 외화 금액: €1,200 / £50k / ¥300万 / USD 2.5M / 3 million dollars / 500円 / 2万元
  {
    type: 'AMOUNT',
    confidence: 0.8,
    regex: new RegExp(
      '(?:US\\$|A\\$|C\\$|HK\\$|S\\$|[€£¥₩₹]|(?<![A-Za-z])(?:USD|EUR|GBP|JPY|CNY|RMB|KRW|INR|CHF|AUD|CAD|HKD|SGD)\\s?)\\s?\\d[\\d,]*(?:\\.\\d+)?' +
        '(?:\\s?(?:[kKMB](?![A-Za-z])|bn|mn|million|billion|thousand|万|億|만|억))?' +
        '|(?<![\\d,.])\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|K|M|bn|million|billion|thousand|万|億)?\\s?' +
        '(?:dollars?|euros?|pounds?|yen|won|yuan|円|元|ドル|ユーロ|美元|人民币|人民幣)(?![A-Za-z])',
      'g',
    ),
  },

  // ── 연락처 ──
  // 국제 전화번호 +1 415-555-0123 / +44 20 7946 0958 / +81 90-1234-5678 (+82 는 detect.mjs 가 처리)
  {
    type: 'PHONE',
    confidence: 0.88,
    regex: /(?<![\w+])\+(?!82)[1-9]\d{0,2}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d{1,4}(?:[\s.-]?\d{2,4}){1,4}(?!\d)/g,
    filter: (v) => digitCount(v) >= 8 && digitCount(v) <= 15,
  },
  // 북미 형식 (415) 555-0123 / 415-555-0123
  { type: 'PHONE', confidence: 0.8, regex: /(?<![\d-])(?:\([2-9]\d{2}\)\s?|[2-9]\d{2}[\s.-])[2-9]\d{2}[\s.-]\d{4}(?![\d-])/g },
  // 일본 휴대폰 090-1234-5678
  { type: 'PHONE', confidence: 0.88, regex: /(?<!\d)0[789]0[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g },

  // ── 네트워크 ──
  // IPv6 (전체형 또는 :: 축약형, 그룹 3개 이상)
  {
    type: 'IP',
    confidence: 0.8,
    regex: /(?<![:\w])(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(?![:\w])|(?<![:\w])(?:[0-9a-fA-F]{1,4}:){1,6}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,5})?(?![:\w])/g,
    filter: (v) => (v.match(/[0-9a-fA-F]{1,4}/g) || []).length >= 3 && /[a-fA-F]|::/.test(v),
  },

  // ── 주소 ──
  // 미국식: 1600 Amphitheatre Parkway, Mountain View, CA 94043 / 221B Baker Street
  {
    type: 'ADDRESS',
    confidence: 0.8,
    regex: new RegExp(
      `(?<![\\w])\\d{1,6}[A-Z]?\\s(?:[A-Z][a-z]+\\s){1,4}(?:${US_STREET})(?![A-Za-z])` +
        `(?:,?\\s(?:Apt|Suite|Ste\\.?|Unit|Floor|Fl\\.?|#)\\s?[\\w-]+)?` +
        `(?:,\\s[A-Z][a-z]+(?:\\s[A-Z][a-z]+){0,2})?(?:,\\s[A-Z]{2})?(?:\\s\\d{5}(?:-\\d{4})?)?`,
      'g',
    ),
  },
  // 영국 우편번호 SW1A 1AA
  { type: 'ADDRESS', confidence: 0.75, regex: /(?<![A-Z0-9])[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}(?![A-Z0-9])/g },
  // 일본 우편번호 〒100-0005
  { type: 'ADDRESS', confidence: 0.9, regex: /〒\s?\d{3}-?\d{4}/g },
  // 일본 주소: 東京都千代田区丸の内1-9-2
  {
    type: 'ADDRESS',
    confidence: 0.75,
    regex: new RegExp(`(?:${JP_PREF})[${CJK}]{1,12}?[市区町村郡][${CJK}0-9０-９]{0,20}?(?:[0-9０-９]+(?:[-－‐丁目番地号][0-9０-９]*){1,4})`, 'g'),
  },
  // 중국 주소: 北京市朝阳区建国路88号
  {
    type: 'ADDRESS',
    confidence: 0.7,
    regex: /[一-龥]{2,6}(?:省|自治区|市)[一-龥]{1,10}?(?:市|区|县|縣|區)(?:[一-龥0-9]{1,15}?(?:路|街|道|巷|镇|鎮|村))?(?:[0-9一-龥]{1,6}号(?:[0-9]{1,5}(?:室|楼|樓|层|層))?)?/g,
    filter: (v) => /[路街道巷镇鎮村号]/.test(v),
  },

  // ── 날짜 (기본 꺼짐) ──
  {
    type: 'DATE',
    confidence: 0.65,
    regex: new RegExp(
      `(?<![A-Za-z])(?:${MONTHS})\\.?\\s\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s\\d{4})?(?![A-Za-z\\d])` +
        `|(?<!\\d)\\d{1,2}(?:st|nd|rd|th)?\\s(?:${MONTHS})\\.?,?\\s\\d{4}` +
        `|(?<![\\d/])\\d{1,2}/\\d{1,2}/(?:\\d{4}|\\d{2})(?![\\d/])` +
        `|\\d{4}年\\d{1,2}月\\d{1,2}[日号]|(?<!\\d)\\d{1,2}月\\d{1,2}[日号]`,
      'g',
    ),
  },
];

// ───────────── 회사명 (영어·일본어·중국어) ─────────────

const EN_ORG_SUFFIX =
  'Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLC|L\\.L\\.C\\.|LLP|PLC|GmbH|AG|S\\.A\\.|SA|S\\.p\\.A\\.|B\\.V\\.|BV|N\\.V\\.|NV|SAS|Pty\\.?\\s?Ltd\\.?|Co\\.,?\\s?Ltd\\.?|K\\.K\\.';
const EN_ORG_SOFT_SUFFIX = 'Holdings|Technologies|Technology|Labs|Partners|Capital|Ventures|Group|Systems|Solutions|Software|Studios|Networks|Pharmaceuticals|Bank|Consulting';
const EN_LEADING_STOP = new Set(['The', 'A', 'An', 'Our', 'Your', 'Their', 'This', 'That', 'Each', 'Every', 'Any', 'Some', 'All', 'Its', 'His', 'Her', 'My', 'New', 'Next', 'Last']);

const det = (type, start, end, text, source, confidence, extra = {}) => ({
  type, value: text.slice(start, end), start, end, source, confidence, ...extra,
});

/** 앞쪽 관사 등을 떼고 detection 을 만든다 */
function trimLeadingStop(text, start, end) {
  let s = start;
  for (;;) {
    const m = /^([A-Z][a-z]*)\s/.exec(text.slice(s, end));
    if (!m || !EN_LEADING_STOP.has(m[1])) break;
    s += m[0].length;
  }
  return s;
}

export function detectIntlOrgs(text) {
  const out = [];
  let m;
  const word = "[A-Z][A-Za-z0-9&'.-]*";

  // Acme Inc. / Foo Bar GmbH / Baz Co., Ltd.  (법인 표기 = 강한 신호)
  const strong = new RegExp(`(?<![A-Za-z0-9])${word}(?:\\s${word}){0,4},?\\s(?:${EN_ORG_SUFFIX})(?![A-Za-z])`, 'g');
  while ((m = strong.exec(text)) !== null) {
    const s = trimLeadingStop(text, m.index, m.index + m[0].length);
    const head = text.slice(s, m.index + m[0].length).replace(new RegExp(`,?\\s(?:${EN_ORG_SUFFIX})$`), '');
    out.push(det('ORG', s, m.index + m[0].length, text, 'org-suffix', 0.88, head.length >= 3 ? { variants: [head] } : {}));
  }
  // Blue Ocean Labs / Raon Capital (약한 신호 → 확인 필요)
  const soft = new RegExp(`(?<![A-Za-z0-9])${word}(?:\\s${word}){0,3}\\s(?:${EN_ORG_SOFT_SUFFIX})(?![A-Za-z])`, 'g');
  while ((m = soft.exec(text)) !== null) {
    const s = trimLeadingStop(text, m.index, m.index + m[0].length);
    if (!/\s/.test(text.slice(s, m.index + m[0].length))) continue; // 접미어만 남으면 버림
    out.push(det('ORG', s, m.index + m[0].length, text, 'org-suffix', 0.7, { uncertain: true }));
  }

  // 일본: 株式会社サンプル / サンプル株式会社 / (株)サンプル / ㈱サンプル
  // 일본어는 띄어쓰기가 없으므로 회사 이름은 히라가나(대개 조사)가 나오기 전까지로 본다.
  const jaName = '[一-龥ァ-ヶーA-Za-z0-9&・]';
  const jaPre = new RegExp(`(?:株式会社|有限会社|合同会社|㈱|\\(株\\)|（株）)\\s?(${jaName}{1,15})`, 'g');
  while ((m = jaPre.exec(text)) !== null) {
    const start = m.index + m[0].length - m[1].length;
    out.push(det('ORG', start, start + m[1].length, text, 'org-suffix', 0.88));
  }
  const jaPost = new RegExp(`(?<!${jaName})(${jaName}{1,15}?)(?:株式会社|有限会社|合同会社|ホールディングス)`, 'g');
  while ((m = jaPost.exec(text)) !== null) {
    out.push(det('ORG', m.index, m.index + m[0].length, text, 'org-suffix', 0.85, m[1].length >= 2 ? { variants: [m[1]] } : {}));
  }

  // 중국: 华为技术有限公司 / 阿里巴巴集团
  const zh = /[一-龥A-Za-z0-9]{2,12}?(?:股份有限公司|有限责任公司|有限公司|集团|集團|公司)/g;
  while ((m = zh.exec(text)) !== null) {
    const core = m[0].replace(/(?:股份有限公司|有限责任公司|有限公司|集团|集團|公司)$/, '');
    if (core.length < 2) continue;
    // 华为技术 → 华为 처럼 업종어를 뗀 약칭도 함께 찾는다
    const short = core.replace(/(?:技术|技術|科技|网络|網絡|电子|電子|软件|軟體|信息|資訊|实业|實業|贸易|貿易|控股|国际|國際|传媒|傳媒)+$/, '');
    const variants = [core, ...(short.length >= 2 && short !== core ? [short] : [])];
    out.push(det('ORG', m.index, m.index + m[0].length, text, 'org-suffix', 0.8, { variants }));
  }
  return out;
}

// ───────────── 인명 (영어·일본어·중국어) ─────────────

const EN_TITLES = 'Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Dame|Madam|Mme|Mlle|Herr|Frau|Sr|Sra';
const EN_NAME = "[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?";
const EN_LIST_KEYS = 'Attendees?|Participants?|Present|Owner|Assignee|Author|Contact|From|To|CC|Bcc|Prepared by|Signed by|Reviewed by|Approved by|Interviewer|Interviewee|Candidate|Customer|Client|Speaker|Host|Reporter|Requester';
const EN_NAME_STOP = new Set(['Team', 'All', 'Everyone', 'None', 'Customer', 'Client', 'Support', 'Sales', 'Marketing', 'Engineering', 'Product', 'Design', 'Finance', 'Legal', 'Hr', 'HR', 'Admin', 'Manager', 'Director', 'Unknown', 'TBD', 'Me', 'You']);
const EN_ROLE_BEFORE = 'CEO|CTO|CFO|COO|CMO|CPO|CISO|VP|SVP|EVP|President|Chairman|Founder|Co-founder|Director|Manager|Engineer|Designer|Lawyer|Attorney|Counsel|Recruiter|Analyst|Consultant|Professor|Officer';

/** 영어 이름 뒤쪽 성(last name)도 따로 찾게 variants 로 준다 ("Mr. Smith" 처럼 성만 나오는 경우) */
function nameVariants(name) {
  const parts = name.split(/\s+/);
  return parts.length >= 2 && parts[parts.length - 1].length >= 3 ? [parts[parts.length - 1]] : [];
}

export function detectIntlPersons(text) {
  const out = [];
  let m;

  // Mr. John Smith / Dr. Kim → 직함은 남기고 이름만
  const byTitle = new RegExp(`(?<![A-Za-z])(?:${EN_TITLES})\\.?\\s(${EN_NAME}(?:\\s${EN_NAME}){0,2})`, 'g');
  while ((m = byTitle.exec(text)) !== null) {
    const start = m.index + m[0].length - m[1].length;
    out.push(det('PERSON', start, start + m[1].length, text, 'person-title', 0.85, { variants: nameVariants(m[1]) }));
  }

  // CEO John Smith / Product Manager Jane Doe
  const byRole = new RegExp(`(?<![A-Za-z])(?:${EN_ROLE_BEFORE})\\s(${EN_NAME}\\s${EN_NAME}(?:\\s${EN_NAME})?)(?![A-Za-z])`, 'g');
  while ((m = byRole.exec(text)) !== null) {
    const start = m.index + m[0].length - m[1].length;
    out.push(det('PERSON', start, start + m[1].length, text, 'person-title', 0.8, { variants: nameVariants(m[1]) }));
  }

  // John Smith, CEO / Jane Doe (Manager)
  const roleAfter = new RegExp(`(?<![A-Za-z])(${EN_NAME}\\s${EN_NAME})(?=,?\\s\\(?(?:${EN_ROLE_BEFORE})(?![a-z]))`, 'g');
  while ((m = roleAfter.exec(text)) !== null) {
    out.push(det('PERSON', m.index, m.index + m[1].length, text, 'person-title', 0.8, { variants: nameVariants(m[1]) }));
  }

  // Attendees: John Smith, Jane Doe, Bob
  const listLine = new RegExp(`(?:^|\\n)[ \\t]*[-*•]?[ \\t]*(?:${EN_LIST_KEYS})[ \\t]*[:：][ \\t]*([^\\n]+)`, 'gi');
  while ((m = listLine.exec(text)) !== null) {
    const lineStart = m.index + m[0].length - m[1].length;
    const item = new RegExp(`(?<![A-Za-z])${EN_NAME}(?:\\s${EN_NAME}){0,2}(?![A-Za-z])`, 'g');
    let n;
    while ((n = item.exec(m[1])) !== null) {
      if (EN_NAME_STOP.has(n[0].split(' ')[0])) continue;
      const s = lineStart + n.index;
      out.push(det('PERSON', s, s + n[0].length, text, 'person-list', 0.75, { variants: nameVariants(n[0]) }));
    }
  }

  // 일본어: 田中さん / 山田太郎様 / 佐藤部長 / 鈴木氏
  const ja = /(?<![一-龥])([一-龥]{1,4}(?:\s?[一-龥]{1,3})?)(?=(?:さん|様|さま|氏|君|くん|ちゃん|先生|部長|課長|係長|社長|専務|常務|主任|室長|担当))/g;
  while ((m = ja.exec(text)) !== null) {
    if (/^(?:会社|御社|弊社|貴社|皆|皆様|各位|担当|お客)$/.test(m[1])) continue;
    out.push(det('PERSON', m.index, m.index + m[1].length, text, 'person-title', 0.75, { uncertain: m[1].length === 1 }));
  }

  // 중국어: 王伟先生 / 李娜女士 / 张经理 / 刘总
  const zh = /(?<![一-龥])([一-龥]{1,3})(?=(?:先生|女士|小姐|经理|經理|总监|總監|老师|老師|教授|总|總|董事长|董事長))/g;
  while ((m = zh.exec(text)) !== null) {
    if (/^(?:各位|大家|客户|客戶|公司|总|總)$/.test(m[1])) continue;
    out.push(det('PERSON', m.index, m.index + m[1].length, text, 'person-title', 0.7, { uncertain: m[1].length === 1 }));
  }

  return out;
}
