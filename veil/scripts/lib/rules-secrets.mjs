// 비밀 정보 탐지 — 비밀번호, API 키·토큰, 접속 주소(URL 속 계정 정보), 사번
// 언어와 상관없이 동작한다. 모두 고위험(highRisk)이라 유출 검사에서도 다시 확인한다.

const TOKEN_LIKE = /^\[[A-Z][A-Z0-9]*_\d+\]/; // 이미 가려진 토큰 ([SECRET_1] 등)

const det = (type, start, end, text, source, confidence, extra = {}) => ({
  type, value: text.slice(start, end), start, end, source, confidence, ...extra,
});

// ── 형식이 정해진 키·토큰 (접두어로 확실히 구분됨) ──
const KEY_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, // 개인 키 블록
  /sk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, // OpenAI
  /github_pat_[A-Za-z0-9_]{40,}/g, // GitHub fine-grained
  /gh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub
  /glpat-[A-Za-z0-9_-]{20,}/g, // GitLab
  /(?:AKIA|ASIA)[0-9A-Z]{16}/g, // AWS access key id
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /xox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack token
  /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g, // Slack webhook
  /(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g, // Stripe
  /hf_[A-Za-z0-9]{30,}/g, // Hugging Face
  /npm_[A-Za-z0-9]{36}/g, // npm
  /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

/**
 * URL 안에 계정 정보가 든 접속 주소: postgresql://admin:Pa$$!2026@db.example.com:5432/prod
 * 비밀번호에 '@'가 있어도 마지막 '@'까지를 계정 정보로 본다. 주소 전체를 하나로 가린다.
 */
export const CREDENTIAL_URL = /(?<![A-Za-z0-9+.\-])[A-Za-z][A-Za-z0-9+.\-]*:\/\/[^\s\/:@]+:[^\s]*@[A-Za-z0-9.\-]+(?::\d+)?(?:\/[^\s"'<>)\]]*)?/g;

/**
 * 가린 뒤에도 "scheme://사용자:무언가" 가 남아 있으면 비밀번호 일부가 새고 있다는 뜻이다.
 * (주소 전체가 제대로 가려졌다면 '://' 자체가 보이지 않는다)
 */
export const CREDENTIAL_URL_FRAGMENT = /[A-Za-z][A-Za-z0-9+.\-]*:\/\/[^\s\/@:\[\]]+:(?!\[[A-Z][A-Z0-9]*_\d+\]@)[^\s\/@]+(?=@|\[[A-Z])/g;

// ── 앞에 붙는 말로 찾는 것 ──
const SEP = '\\s*(?:[:=：]|은|는|이|가|을|를)?\\s*["\'`]?';
const PASSWORD_KEYS = '(?<![A-Za-z])(?:password|passwd|passcode|passphrase|pwd|PW|pw)(?![A-Za-z])|비밀번호|비번|패스워드|암호';
const SECRET_KEYS = '(?<![A-Za-z])(?:api[_\\s-]?key|apikey|secret(?:[_\\s-]?key)?|client[_\\s-]?secret|access[_\\s-]?(?:key|token)|auth[_\\s-]?token|token|bearer)(?![A-Za-z])|(?:API\\s?)?키|토큰|시크릿|비밀\\s?값|서명\\s?키|암호\\s?키';
// 사람·사례에 붙는 식별번호 (주문·티켓·송장 번호처럼 업무용 번호는 제외)
const EMPLOYEE_KEYS = [
  '사번', '사원\\s?번호', '직원\\s?번호', '고객\\s?번호', '회원\\s?(?:번호|ID|아이디)', '상담\\s?번호', '사례\\s?(?:번호|ID)',
  '접수\\s?번호', '환자\\s?번호', '학번', '예약\\s?(?:확인\\s?)?번호', '내담자\\s?번호',
  '(?<![A-Za-z])(?:employee|emp\\.?|staff|customer|client|member|case|patient|student)\\s?(?:id|no\\.?|number|#)(?![A-Za-z])',
].join('|');

// "password reset", "password policy" 처럼 비밀번호 값이 아니라 문장인 경우
const PASSWORD_PROSE = new Set([
  'reset', 'change', 'changed', 'changes', 'policy', 'policies', 'manager', 'required', 'expired', 'expires',
  'protected', 'field', 'length', 'must', 'should', 'update', 'updated', 'rules', 'hint', 'strength',
  'recovery', 'input', 'prompt', 'here', 'again', 'please', 'and', 'the', 'for', 'was', 'has', 'have',
  'will', 'needs', 'need', 'with', 'from', 'that', 'this', 'not', 'are', 'you', 'your', 'our', 'login',
  'protection', 'complexity', 'rotation', 'requirements', 'later', 'none', 'null', 'empty', 'hidden',
]);

/** 비밀번호 뒤에 붙은 한국어 조사·어미와 문장부호를 떼어낸다 (Hunter2!이고 → Hunter2!) */
function trimSecretValue(v) {
  let s = v.replace(/[가-힣]+$/, '');
  s = s.replace(/["'`.,;)\]}>]+$/, '');
  return s;
}

export function detectSecrets(text) {
  const out = [];
  let m;

  for (const re of KEY_PATTERNS) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      // 앞뒤가 영문·숫자로 이어지면 다른 단어의 일부이므로 건너뜀
      const before = text[m.index - 1];
      if (before && /[A-Za-z0-9_]/.test(before)) continue;
      out.push(det('SECRET', m.index, m.index + m[0].length, text, 'secret-key', 0.99));
    }
  }

  CREDENTIAL_URL.lastIndex = 0;
  while ((m = CREDENTIAL_URL.exec(text)) !== null) {
    const v = m[0].replace(/[.,;:!?]+$/, '');
    out.push(det('SECRET', m.index, m.index + v.length, text, 'credential-url', 0.995));
  }

  // 비밀번호: "비밀번호: Hunter2!pass", "password=abc123", "비번은 qwer1234이고"
  const pw = new RegExp(`(?:${PASSWORD_KEYS})${SEP}([^\\s"'\`，,;]{3,})`, 'gi');
  while ((m = pw.exec(text)) !== null) {
    const raw = m[1];
    if (TOKEN_LIKE.test(raw)) continue;
    const v = trimSecretValue(raw);
    if (v.length < 3) continue;
    if (PASSWORD_PROSE.has(v.toLowerCase())) continue;
    const start = m.index + m[0].length - raw.length;
    // 영어 단어만 있으면(예: "password reset") 일반 문장일 수 있어 확인 필요로 표시
    const plainWord = /^[A-Za-z]+$/.test(v);
    out.push(det('SECRET', start, start + v.length, text, 'password', plainWord ? 0.7 : 0.97, plainWord ? { uncertain: true } : {}));
  }

  // API 키·토큰: "API 키: xxxxx", "token=xxxxx" (16자 이상 영숫자 덩어리만)
  const key = new RegExp(`(?:${SECRET_KEYS})${SEP}([A-Za-z0-9_\\-./+=]{16,})`, 'gi');
  while ((m = key.exec(text)) !== null) {
    const raw = m[1];
    if (!/\d/.test(raw) || !/[A-Za-z]/.test(raw)) continue; // 숫자와 영문이 섞여 있어야 키로 봄
    const start = m.index + m[0].length - raw.length;
    out.push(det('SECRET', start, start + raw.length, text, 'secret-context', 0.95));
  }

  // 사번: "사번은 EMP-20431입니다", "Employee ID: 004512"
  // 영문·숫자 덩어리를 하이픈·밑줄로 최대 5개까지 이은 형태 (EMP-TEST-005, RSV-2026-118, 004512), 숫자 2개 이상 필수
  const emp = new RegExp(`(?:${EMPLOYEE_KEYS})${SEP}([A-Za-z0-9]{1,12}(?:[-_][A-Za-z0-9]{1,12}){0,4})(?![A-Za-z0-9-])`, 'gi');
  while ((m = emp.exec(text)) !== null) {
    if ((m[1].match(/\d/g) || []).length < 2) continue;
    const start = m.index + m[0].length - m[1].length;
    out.push(det('EMPLOYEE_ID', start, start + m[1].length, text, 'employee-id', 0.95));
  }

  return out;
}
