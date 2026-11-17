#!/usr/bin/env node
// Veil CLI — 글 속 민감정보를 [TYPE_N] 토큰으로 가리고, 나중에 원문으로 되돌린다.
//
//   veil <파일>        가리기. 이미 가린 결과물(토큰이 든 파일)을 주면 알아서 되돌린다.
//   veil detect <파일> 미리보기 (파일을 만들지 않음)
//   veil check <파일>  원문이 남았는지 검사
//   veil types         가리는 종류 목록
//
// 대응표는 파일과 같은 폴더의 .veil/map.json 에 자동으로 보관되고, 되돌릴 때 알아서 찾는다.
// 원문·대응표 내용은 화면에 찍지 않는다 (AI가 이 출력을 읽기 때문). --show 일 때만 원문을 표시한다.

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TYPES, ENTITY_TYPES, maskValue } from './lib/detect.mjs';
import { checkLeak, findPreexistingTokens, TOKEN_RE, unveil, veil } from './lib/tokenize.mjs';
import { detect } from './lib/detect.mjs';

const HELP = `Veil — 글 속 민감정보를 가리고 되돌립니다 (모두 내 컴퓨터에서)

  veil <파일>              가리기 → <이름>.veiled.<확장자>
                           가린 결과물(토큰이 든 파일)을 주면 되돌리기 → <이름>.unveiled.<확장자>
  veil <파일> <파일> …      여러 파일을 한 번에 (같은 사람은 같은 토큰)

자주 쓰는 옵션
  --skip-types AMOUNT      금액은 남기기
  --types PERSON,RRN       이름과 주민번호만 가리기
  --add-types DATE         날짜도 가리기 (기본은 꺼짐)
  --allow "법무팀,본사"      이 단어는 남기기
  --dict 사전.json          이 단어는 꼭 가리기   예: {"PROJECT":["블루문"]}
  -v                       가린 항목을 모두 보여주기 (값은 첫 글자만)

그 밖의 명령
  veil detect <파일>        미리보기 (파일을 만들지 않음)
  veil check <파일>         원문이나 고위험 정보가 남았는지 검사
  veil types               가리는 종류 목록
  veil help --all          모든 옵션

대응표(원문 ↔ 토큰)는 같은 폴더의 .veil/map.json 에 자동 보관되고 git 에서 자동 제외됩니다.
원문이 들어 있으니 공유하지 마세요.`;

const HELP_ALL = `${HELP}

전체 옵션
  --map <path>         대응표를 직접 지정 (기본: .veil/map.json, 되돌릴 때는 자동으로 찾음)
  --out <path>         출력 파일 경로 (입력 파일이 하나일 때만)
  --allow-file <path>  남길 단어 목록 파일 (한 줄에 하나)
  --ner                로컬 NER 모델로 사람·회사·지명도 찾기 (영·독·불·스·이·포·네·아랍·중 등)
                       처음 한 번 scripts 폴더에서 npm install 필요, 모델은 첫 실행 때 내려받음
  --ner-model <id>     다른 Hugging Face 토큰 분류 모델 사용 (ONNX 변환본)
  --show               원문 값을 화면에 표시 (원문이 이미 대화에 있을 때만)
  --loose              되돌릴 때 대괄호가 빠진 토큰(PERSON_1)도 복원
  -v, --verbose        가린 항목을 모두 보여주기

명시적으로 고르기
  veil mask <파일>      토큰 모양 글자가 들어 있어도 무조건 가리기 (예전 이름: veil veil)
  veil unmask <파일>    무조건 되돌리기 (예전 이름: veil unveil)

종료 코드: 0 정상, 1 오류, 2 유출 의심(가린 결과에 원문/고위험 패턴이 남음)`;

// 화면에 보여줄 짧은 이름
const SHORT = {
  PERSON: '이름', ORG: '회사', PHONE: '전화', EMAIL: '이메일', RRN: '주민번호', SSN: 'SSN', PASSPORT: '여권',
  SECRET: '비밀정보', EMPLOYEE_ID: '식별번호', CARD: '카드', ACCOUNT: '계좌', IP: 'IP', ADDRESS: '주소',
  AMOUNT: '금액', LOCATION: '지명', DATE: '날짜',
};

// ───────────── 인자 파싱 ─────────────

const COMMANDS = new Set(['mask', 'veil', 'unmask', 'unveil', 'restore', 'detect', 'check', 'types', 'help']);

function parseArgs(argv) {
  let cmd = null;
  const files = [];
  const opt = {};
  const flags = new Set(['show', 'loose', 'force', 'help', 'ner', 'all', 'verbose']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-v') opt.verbose = true;
    else if (a === '-h') opt.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      if (flags.has(key)) opt[key] = true;
      else {
        if (i + 1 >= argv.length) fail(`${a} 뒤에 값이 필요해요.`);
        opt[key] = argv[++i];
      }
    } else if (cmd === null && files.length === 0 && COMMANDS.has(a) && !fs.existsSync(a)) cmd = a;
    else files.push(a);
  }
  return { cmd: cmd || 'auto', files, opt };
}

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);
const rel = (p) => {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith('..') ? r : p;
};

// ───────────── 파일 입출력 ─────────────

function readText(file) {
  if (!fs.existsSync(file)) fail(`파일이 없어요: ${file}`);
  if (fs.statSync(file).isDirectory()) fail(`폴더가 아니라 파일을 주세요: ${file}`);
  let buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' };
  } catch {
    // 한국어 윈도우에서 만든 메모장 파일 (CP949/EUC-KR)
    try {
      return { text: new TextDecoder('euc-kr').decode(buf), encoding: 'euc-kr' };
    } catch {
      fail(`텍스트 파일로 읽을 수 없어요: ${file} (docx/pdf 등은 먼저 텍스트로 바꿔 주세요)`);
    }
  }
}

function derivePath(file, tag) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext).replace(/\.(veiled|unveiled)$/, '');
  return path.join(dir, `${base}.${tag}${ext || '.txt'}`);
}

// ───────────── 대응표 위치 ─────────────
// 기본: 파일과 같은 폴더의 .veil/map.json — 그 폴더의 파일들이 대응표 하나를 같이 쓴다.
// 예전 방식(<이름>.veilmap.json)도 그대로 읽는다.

const legacyMapPath = (file) => {
  const ext = path.extname(file);
  return path.join(path.dirname(file), `${path.basename(file, ext).replace(/\.(veiled|unveiled)$/, '')}.veilmap.json`);
};
const folderMapPath = (file) => path.join(path.dirname(path.resolve(file)), '.veil', 'map.json');

function loadMap(mapPath) {
  if (!fs.existsSync(mapPath)) fail(`대응표가 없어요: ${mapPath}`);
  try {
    const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (!Array.isArray(data.entries)) throw new Error('entries 없음');
    data.files ||= [];
    return data;
  } catch (e) {
    fail(`대응표를 읽을 수 없어요: ${mapPath} (${e.message})`);
  }
}

/** 가릴 때 쓸 대응표: --map > 예전 방식 파일이 있으면 그것 > .veil/map.json */
function mapForMasking(file, opt) {
  if (opt.map) return opt.map;
  const legacy = legacyMapPath(file);
  if (fs.existsSync(legacy)) return legacy;
  return folderMapPath(file);
}

/** 되돌릴 때 쓸 대응표: 파일 속 토큰을 가장 많이 가진 대응표를 이 폴더와 상위 폴더에서 찾는다 */
function findMapForTokens(file, tokens) {
  const candidates = [];
  let dir = path.dirname(path.resolve(file));
  for (let depth = 0; depth < 8; depth++) {
    candidates.push(path.join(dir, '.veil', 'map.json'));
    try {
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.veilmap.json')) candidates.push(path.join(dir, f));
    } catch { /* 읽을 수 없는 폴더는 건너뜀 */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  let best = null;
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(c, 'utf8')); } catch { continue; }
    const known = new Set((data.entries || []).map((e) => e.token));
    const hits = tokens.filter((t) => known.has(t)).length;
    if (hits && (!best || hits > best.hits)) best = { path: c, hits };
  }
  return best?.path || null;
}

function saveMap(mapPath, map) {
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  if (path.basename(path.dirname(mapPath)) === '.veil') {
    // .veil 폴더 전체를 git 에서 제외 (원문이 든 대응표가 실수로 커밋되지 않도록)
    const gi = path.join(path.dirname(mapPath), '.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, '# Veil 대응표 — 원문이 들어 있어 커밋하지 않습니다\n*\n', 'utf8');
  }
  map.updatedAt = new Date().toISOString();
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');
}

function buildOptions(opt) {
  let types = opt.types ? list(opt.types).map((t) => t.toUpperCase()) : [...DEFAULT_TYPES];
  for (const t of list(opt['add-types'])) if (!types.includes(t.toUpperCase())) types.push(t.toUpperCase());
  const skip = new Set(list(opt['skip-types']).map((t) => t.toUpperCase()));
  types = types.filter((t) => !skip.has(t));

  let dictionary = {};
  if (opt.dict) {
    try {
      dictionary = JSON.parse(readText(opt.dict).text);
    } catch (e) {
      fail(`사전 JSON을 읽을 수 없어요: ${opt.dict} (${e.message})`);
    }
    for (const k of Object.keys(dictionary)) if (skip.has(k.toUpperCase())) delete dictionary[k];
  }

  const allow = [...list(opt.allow)];
  if (opt['allow-file']) {
    allow.push(...readText(opt['allow-file']).text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  }
  return { types, dictionary, allow };
}

/** --ner 이면 로컬 NER 모델을 돌려 개체 위치 목록을 돌려준다 (없으면 빈 배열) */
async function nerFor(text, opt) {
  if (!opt.ner) return [];
  const { runNer, NerUnavailableError } = await import('./lib/ner.mjs');
  try {
    return await runNer(text, { model: opt['ner-model'], onProgress: (m) => console.error(m) });
  } catch (e) {
    if (e instanceof NerUnavailableError) fail(e.message);
    fail(`NER 실행 실패: ${e.message}`);
  }
}

// ───────────── 출력 도우미 ─────────────

const shown = (value, show) => (show ? value : maskValue(value));

/** 이름 4 · 회사 3 · 전화 2 */
function summary(entries) {
  const counts = {};
  for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
  const parts = Object.entries(counts).map(([t, n]) => `${SHORT[t] || t} ${n}`);
  return parts.length ? parts.join(' · ') : '가릴 것이 없었어요';
}

function printEntries(entries, { show, countKey = 'count' }) {
  if (entries.length === 0) {
    console.log('  (탐지된 항목 없음)');
    return;
  }
  const byType = {};
  for (const e of entries) (byType[e.type] ||= []).push(e);
  for (const [type, items] of Object.entries(byType)) {
    console.log(`  ${SHORT[type] || type} (${type}) — ${items.length}개`);
    for (const e of items) {
      const flag = e.uncertain ? '  ⚠ 확인 필요' : '';
      console.log(`    ${e.token.padEnd(16)} ${shown(e.original, show).padEnd(14)} ${String(e[countKey]).padStart(3)}회  [${e.sources.join(',')}]${flag}`);
    }
  }
}

function printLeak(leak) {
  if (leak.clean) return console.log('  유출 검사 통과');
  console.log('  ⚠ 유출 검사 경고');
  for (const r of leak.residualOriginals) console.log(`    원문이 남음: ${r.token} (${r.type}) ${r.hits}곳`);
  for (const r of leak.residualPatterns) console.log(`    가려지지 않은 ${r.type}: ${r.preview}`);
}

// ───────────── 가리기 ─────────────

async function maskFiles(files, opt) {
  if (files.length === 0) fail('가릴 파일을 알려 주세요. 예: veil 회의록.txt');
  if (opt.out && files.length > 1) fail('--out 은 파일이 하나일 때만 쓸 수 있어요.');
  const o = buildOptions(opt);
  const mapPath = mapForMasking(files[0], opt);
  const mapExists = fs.existsSync(mapPath);
  const map = mapExists
    ? loadMap(mapPath)
    : { veil: 1, warning: '이 파일에는 가리기 전 원문이 들어 있습니다. AI에게 보여주거나 공유하지 마세요.', files: [], entries: [] };

  let leaked = false;
  let entries = map.entries;
  const uncertain = [];
  for (const file of files) {
    const { text, encoding } = readText(file);
    const pre = findPreexistingTokens(text);
    const r = veil(text, { ...o, prior: entries, ner: await nerFor(text, opt) });
    entries = r.entries;
    const outPath = opt.out || derivePath(file, 'veiled');
    fs.writeFileSync(outPath, r.veiled, 'utf8');
    map.files.push({ source: path.basename(file), veiled: path.basename(outPath), at: new Date().toISOString() });

    console.log(`✔ 가렸어요: ${rel(file)} → ${rel(outPath)}${encoding !== 'utf-8' ? `  (${encoding} → UTF-8)` : ''}`);
    console.log(`  ${summary(r.thisFile)}`);
    if (pre.length) console.log(`  ⚠ 원본에 이미 토큰 모양 글자가 있어요: ${pre.join(', ')} — 되돌릴 때 섞일 수 있어요.`);
    if (opt.verbose) printEntries(r.thisFile, { show: opt.show, countKey: 'countHere' });
    printLeak(r.leak);
    uncertain.push(...r.thisFile.filter((e) => e.uncertain));
    if (!r.leak.clean) leaked = true;
  }
  map.entries = entries;
  saveMap(mapPath, map);

  if (uncertain.length) {
    const shownList = uncertain.slice(0, 8).map((e) => `${e.token} ${shown(e.original, opt.show)}`).join(', ');
    console.log(`\n⚠ 확인 필요 ${uncertain.length}개: ${shownList}${uncertain.length > 8 ? ' …' : ''}`);
    console.log('  일반 단어일 수도 있어요. 남기려면 --allow "단어" 를 붙여 다시 실행하세요.');
  }
  console.log(`\n대응표: ${rel(mapPath)}${mapExists ? ' (이어서 기록)' : ''}  · 원문이 들어 있어요. 공유하지 마세요.`);
  return leaked ? 2 : 0;
}

// ───────────── 되돌리기 ─────────────

function unmaskFiles(files, opt) {
  if (files.length === 0) fail('되돌릴 파일을 알려 주세요. 예: veil 요약.md');
  if (opt.out && files.length > 1) fail('--out 은 파일이 하나일 때만 쓸 수 있어요.');
  for (const file of files) {
    const { text } = readText(file);
    const tokens = [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[0]))];
    const mapPath = opt.map || findMapForTokens(file, tokens);
    if (!mapPath) fail(`${rel(file)} 의 토큰에 맞는 대응표를 찾지 못했어요. 가릴 때 만든 대응표를 --map 으로 알려 주세요.`);
    const r = unveil(text, loadMap(mapPath).entries, { loose: opt.loose });
    const outPath = opt.out || derivePath(file, 'unveiled');
    fs.writeFileSync(outPath, r.text, 'utf8');
    const total = Object.values(r.replaced).reduce((a, b) => a + b, 0);
    console.log(`✔ 되돌렸어요: ${rel(file)} → ${rel(outPath)}`);
    console.log(`  토큰 ${total}곳 복원${r.josaFixed ? ` · 조사 ${r.josaFixed}곳 고침` : ''} · 대응표 ${rel(mapPath)}`);
    const unknown = Object.keys(r.unknown);
    if (unknown.length) console.log(`  ⚠ 대응표에 없는 토큰: ${unknown.join(', ')} — 그대로 두었어요.`);
    const bare = Object.keys(r.bare);
    if (bare.length) {
      console.log(opt.loose
        ? `  대괄호 없는 토큰도 복원했어요: ${bare.join(', ')}`
        : `  ⚠ 대괄호가 빠진 토큰: ${bare.map((b) => b.slice(1, -1)).join(', ')} — 복원하려면 --loose`);
    }
  }
  return 0;
}

// ───────────── 자동: 토큰이 든 파일이면 되돌리고, 아니면 가린다 ─────────────

async function autoFiles(files, opt) {
  if (files.length === 0) {
    console.log(HELP);
    return 0;
  }
  const toUnmask = [];
  const toMask = [];
  for (const f of files) {
    const { text } = readText(f);
    const tokens = [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[0]))];
    if (tokens.length && (opt.map || findMapForTokens(f, tokens))) toUnmask.push(f);
    else toMask.push(f);
  }
  let code = 0;
  if (toMask.length) code = Math.max(code, await maskFiles(toMask, opt));
  if (toUnmask.length) code = Math.max(code, unmaskFiles(toUnmask, opt));
  return code;
}

// ───────────── 그 밖의 명령 ─────────────

function cmdTypes() {
  console.log('가리는 종류 (✓ = 기본으로 켜짐)');
  for (const [t, info] of Object.entries(ENTITY_TYPES)) {
    console.log(`  ${info.defaultOn ? '✓' : ' '} ${t.padEnd(12)} ${info.label}${info.highRisk ? '  (고위험)' : ''}`);
  }
  console.log('\n사전(--dict)에는 PROJECT, PRODUCT 같은 이름도 자유롭게 쓸 수 있어요.');
  return 0;
}

async function cmdDetect(files, opt) {
  if (files.length !== 1) fail('detect 는 파일 하나만 받아요.');
  const { text } = readText(files[0]);
  const mapPath = opt.map || (fs.existsSync(folderMapPath(files[0])) ? folderMapPath(files[0]) : null);
  const prior = mapPath && fs.existsSync(mapPath) ? loadMap(mapPath).entries : [];
  const { thisFile, leak } = veil(text, { ...buildOptions(opt), prior, ner: await nerFor(text, opt) });
  console.log(`미리보기: ${rel(files[0])} (${[...text].length}자) — 파일은 만들지 않았어요.`);
  console.log(`  ${summary(thisFile)}`);
  printEntries(thisFile, { show: opt.show, countKey: 'countHere' });
  const unc = thisFile.filter((e) => e.uncertain).length;
  if (unc) console.log(`\n⚠ 확인 필요 ${unc}개: 일반 단어일 수도 있어요. 남기려면 --allow 로 빼세요.`);
  printLeak(leak);
  return 0;
}

function cmdCheck(files, opt) {
  if (files.length !== 1) fail('check 는 파일 하나만 받아요.');
  const { text } = readText(files[0]);
  const tokens = [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[0]))];
  const mapPath = opt.map || findMapForTokens(files[0], tokens) || (fs.existsSync(folderMapPath(files[0])) ? folderMapPath(files[0]) : null);
  const entries = mapPath ? loadMap(mapPath).entries : [];
  const leak = checkLeak(text, entries, buildOptions(opt).allow);
  console.log(`검사: ${rel(files[0])}${mapPath ? ` (대응표 ${rel(mapPath)} 대조)` : ' (패턴 검사만)'}`);
  printLeak(leak);
  const soft = detect(text, buildOptions(opt)).filter((d) => !d.uncertain);
  if (!mapPath && soft.length) console.log(`  참고: 이름·회사·금액 등 가릴 만한 후보 ${soft.length}곳이 보여요 (veil detect 로 확인).`);
  return leak.clean ? 0 : 2;
}

// ───────────── main ─────────────

const { cmd, files, opt } = parseArgs(process.argv.slice(2));
if (opt.help || cmd === 'help') {
  console.log(opt.all ? HELP_ALL : HELP);
  process.exit(0);
}
const handlers = {
  auto: () => autoFiles(files, opt),
  mask: () => maskFiles(files, opt),
  veil: () => maskFiles(files, opt),
  unmask: () => unmaskFiles(files, opt),
  unveil: () => unmaskFiles(files, opt),
  restore: () => unmaskFiles(files, opt),
  detect: () => cmdDetect(files, opt),
  check: () => cmdCheck(files, opt),
  types: () => cmdTypes(),
};
// 파일이 아닌 낯선 단어를 첫 인자로 주면 오타일 가능성이 크다
if (cmd === 'auto' && files.length && !fs.existsSync(files[0]) && /^[a-z]+$/.test(files[0])) {
  fail(`알 수 없는 명령이에요: ${files[0]}  (veil help 로 사용법 보기)`);
}
process.exit(await handlers[cmd]());
