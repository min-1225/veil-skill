#!/usr/bin/env node
// MaskForge CLI — 글 속 민감정보를 [TYPE_N] 토큰으로 가리고, 나중에 원문으로 되돌린다.
//
//   node veil.mjs detect <파일>            탐지만 해보기 (파일 안 씀)
//   node veil.mjs veil   <파일...>         가린 파일 + 대응표 만들기
//   node veil.mjs unveil <파일...> --map   토큰을 원문으로 되돌리기
//   node veil.mjs check  <파일> [--map]    원문이 남았는지 검사
//   node veil.mjs types                    탐지 종류 목록
//
// 원문·대응표 내용은 기본적으로 화면에 찍지 않는다 (AI가 이 출력을 읽기 때문).
// 원문을 이미 대화에 붙여넣은 경우에만 --show 로 원문을 표시한다.

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TYPES, ENTITY_TYPES, maskValue } from './lib/detect.mjs';
import { checkLeak, findPreexistingTokens, unveil, veil } from './lib/tokenize.mjs';
import { detect } from './lib/detect.mjs';

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

const HELP = `MaskForge — 민감정보 가리기/되돌리기

사용법:
  node veil.mjs detect <파일> [옵션]          탐지 결과 미리보기 (파일을 만들지 않음)
  node veil.mjs veil <파일...> [옵션]         <이름>.veiled.<확장자> + <이름>.veilmap.json 생성
  node veil.mjs unveil <파일...> --map <대응표> [--loose]
                                             <이름>.unveiled.<확장자> 생성
  node veil.mjs check <파일> [--map <대응표>]  원문/고위험 패턴이 남았는지 검사
  node veil.mjs types                         탐지 종류 목록

옵션:
  --map <path>         대응표 경로. veil 에서 이미 있는 파일이면 토큰 번호를 이어서 씀
  --out <path>         출력 파일 경로 (입력 파일이 하나일 때만)
  --dict <path>        사용자 사전 JSON  예: {"ORG":["한빛테크"],"PERSON":["소지윤"],"PROJECT":["블루문"]}
  --allow <a,b,...>    절대 가리지 않을 단어 (오탐 제외)
  --allow-file <path>  가리지 않을 단어 목록 파일 (한 줄에 하나)
  --types <A,B>        탐지 종류를 이것만 사용 (기본: DATE 제외 전부)
  --add-types <A,B>    기본 종류에 추가 (예: DATE)
  --skip-types <A,B>   기본 종류에서 제외 (예: AMOUNT)
  --ner                로컬 NER 모델로 사람·회사·지명도 찾기 (영·독·불·스·이·포·네·아랍·중 등)
                       처음 한 번 scripts 폴더에서 npm install 필요, 모델은 첫 실행 때 내려받음
  --ner-model <id>     다른 Hugging Face 토큰 분류 모델 사용 (ONNX 변환본)
  --show               원문 값을 화면에 표시 (원문이 이미 대화에 있을 때만)
  --loose              unveil: 대괄호가 빠진 토큰(PERSON_1)도 복원
  --force              출력 파일이 이미 있어도 덮어쓰기

종료 코드: 0 정상, 1 오류, 2 유출 의심(가린 결과에 원문/고위험 패턴이 남음)`;

// ───────────── 인자 파싱 ─────────────

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const files = [];
  const opt = {};
  const flags = new Set(['show', 'loose', 'force', 'help', 'ner']);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (flags.has(key)) opt[key] = true;
      else {
        if (i + 1 >= rest.length) fail(`${a} 뒤에 값이 필요합니다.`);
        opt[key] = rest[++i];
      }
    } else files.push(a);
  }
  return { cmd, files, opt };
}

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

// ───────────── 파일 입출력 ─────────────

function readText(file) {
  if (!fs.existsSync(file)) fail(`파일이 없습니다: ${file}`);
  let buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' };
  } catch {
    // 한국어 윈도우에서 만든 메모장 파일 (CP949/EUC-KR)
    try {
      return { text: new TextDecoder('euc-kr').decode(buf), encoding: 'euc-kr' };
    } catch {
      fail(`텍스트 파일로 읽을 수 없습니다: ${file} (docx/pdf 등은 먼저 텍스트로 변환하세요)`);
    }
  }
}

function writeText(file, text, force) {
  if (fs.existsSync(file) && !force) fail(`이미 파일이 있습니다: ${file} (덮어쓰려면 --force)`);
  fs.writeFileSync(file, text, 'utf8');
}

function derivePath(file, tag) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  let base = path.basename(file, ext);
  base = base.replace(/\.(veiled|unveiled)$/, '');
  return path.join(dir, `${base}.${tag}${ext || '.txt'}`);
}

function defaultMapPath(file) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext).replace(/\.(veiled|unveiled)$/, '');
  return path.join(dir, `${base}.veilmap.json`);
}

function loadMap(mapPath) {
  if (!fs.existsSync(mapPath)) fail(`대응표가 없습니다: ${mapPath}`);
  try {
    const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (!Array.isArray(data.entries)) throw new Error('entries 없음');
    return data;
  } catch (e) {
    fail(`대응표를 읽을 수 없습니다: ${mapPath} (${e.message})`);
  }
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
      fail(`사전 JSON을 읽을 수 없습니다: ${opt.dict} (${e.message})`);
    }
    for (const k of Object.keys(dictionary)) if (skip.has(k.toUpperCase())) delete dictionary[k];
  }

  const allow = [...list(opt.allow)];
  if (opt['allow-file']) {
    allow.push(...readText(opt['allow-file']).text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  }
  return { types, dictionary, allow };
}

// ───────────── 출력 도우미 ─────────────

const shown = (value, show) => (show ? value : maskValue(value));

function printEntries(entries, { show, countKey = 'count' }) {
  if (entries.length === 0) {
    console.log('  (탐지된 항목 없음)');
    return;
  }
  const byType = {};
  for (const e of entries) (byType[e.type] ||= []).push(e);
  for (const [type, items] of Object.entries(byType)) {
    const label = ENTITY_TYPES[type]?.label || '사용자 지정';
    console.log(`  ${type} (${label}) — ${items.length}개`);
    for (const e of items) {
      const flag = e.uncertain ? '  ⚠ 확인 필요' : '';
      console.log(`    ${e.token.padEnd(13)} ${shown(e.original, show).padEnd(14)} ${String(e[countKey]).padStart(3)}회  [${e.sources.join(',')}]${flag}`);
    }
  }
}

function printLeak(leak, show) {
  if (leak.clean) {
    console.log('유출 검사: 통과 (원문 값과 고위험 패턴이 남아 있지 않음)');
    return;
  }
  console.log('유출 검사: ⚠ 경고');
  for (const r of leak.residualOriginals) console.log(`  원문이 남음: ${r.token} (${r.type}) ${r.hits}곳`);
  for (const r of leak.residualPatterns) console.log(`  가려지지 않은 ${r.type}: ${show ? r.value ?? r.preview : r.preview}`);
}

// ───────────── 명령 ─────────────

function cmdTypes() {
  console.log('탐지 종류 (✓ = 기본으로 켜짐)');
  for (const [t, info] of Object.entries(ENTITY_TYPES)) {
    console.log(`  ${info.defaultOn ? '✓' : ' '} ${t.padEnd(8)} ${info.label}${info.highRisk ? '  (고위험: check 에서 항상 검사)' : ''}`);
  }
  console.log('\n사용자 사전(--dict)에는 PROJECT, PRODUCT 같은 임의의 종류 이름도 쓸 수 있습니다.');
}

async function cmdDetect(files, opt) {
  if (files.length !== 1) fail('detect 는 파일 하나만 받습니다.');
  const { text } = readText(files[0]);
  const o = buildOptions(opt);
  const prior = opt.map && fs.existsSync(opt.map) ? loadMap(opt.map).entries : [];
  const ner = await nerFor(text, opt);
  const { thisFile, leak } = veil(text, { ...o, prior, ner });
  console.log(`미리보기: ${files[0]} (${[...text].length}자) — 파일은 만들지 않았습니다.`);
  printEntries(thisFile, { show: opt.show, countKey: 'countHere' });
  const unc = thisFile.filter((e) => e.uncertain).length;
  if (unc) console.log(`\n⚠ 확인 필요 ${unc}개: 패턴이 약해서 일반 단어일 수도 있습니다. 아니면 --allow 로 빼세요.`);
  printLeak(leak, opt.show);
}

async function cmdVeil(files, opt) {
  if (files.length === 0) fail('가릴 파일을 지정하세요.');
  if (opt.out && files.length > 1) fail('--out 은 파일이 하나일 때만 쓸 수 있습니다.');
  const o = buildOptions(opt);
  const mapPath = opt.map || defaultMapPath(files[0]);
  const mapExists = fs.existsSync(mapPath);
  const map = mapExists
    ? loadMap(mapPath)
    : { maskforge: 1, warning: '이 파일에는 가리기 전 원문이 들어 있습니다. AI에게 보여주거나 공유하지 마세요.', files: [], entries: [] };

  // 쓰기 전에 출력 경로를 모두 확인한다 (중간에 멈추면 대응표 없는 가린 파일이 남기 때문)
  for (const file of files) {
    const outPath = opt.out || derivePath(file, 'veiled');
    if (fs.existsSync(outPath) && !opt.force) fail(`이미 파일이 있습니다: ${outPath} (덮어쓰려면 --force)`);
  }

  let leaked = false;
  let entries = map.entries;
  const results = [];
  for (const file of files) {
    const { text, encoding } = readText(file);
    const pre = findPreexistingTokens(text);
    const ner = await nerFor(text, opt);
    const r = veil(text, { ...o, prior: entries, ner });
    entries = r.entries;
    const outPath = opt.out || derivePath(file, 'veiled');
    writeText(outPath, r.veiled, opt.force);
    map.files.push({ source: path.basename(file), veiled: path.basename(outPath), at: new Date().toISOString() });
    results.push({ file, outPath, encoding, pre, ...r });
    if (!r.leak.clean) leaked = true;
  }
  map.entries = entries;
  map.updatedAt = new Date().toISOString();
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');

  for (const r of results) {
    console.log(`가린 파일: ${r.outPath}${r.encoding !== 'utf-8' ? `  (원본 ${r.encoding} → UTF-8로 저장)` : ''}`);
    if (r.pre.length) console.log(`  ⚠ 원본에 이미 토큰 모양 문자열이 있습니다: ${r.pre.join(', ')} — 복원할 때 섞일 수 있습니다.`);
    printEntries(r.thisFile, { show: opt.show, countKey: 'countHere' });
    printLeak(r.leak, opt.show);
    console.log('');
  }
  console.log(`대응표: ${mapPath}${mapExists ? ' (기존 대응표에 이어서 기록)' : ''}`);
  console.log('  → 원문이 들어 있는 파일입니다. 내용을 읽거나 출력하지 마세요. 사용자가 직접 열어 확인할 수 있습니다.');
  const unc = results.flatMap((r) => r.thisFile).filter((e) => e.uncertain);
  if (unc.length) {
    console.log(`\n⚠ 확인 필요 ${unc.length}개 (${unc.map((e) => e.token).join(', ')}): 일반 단어가 잘못 잡혔을 수 있습니다.`);
    console.log('  사용자가 대응표에서 확인한 뒤, 가리지 않을 단어는 --allow 로 빼고 --force 로 다시 실행하세요.');
  }
  process.exit(leaked ? 2 : 0);
}

function cmdUnveil(files, opt) {
  if (files.length === 0) fail('되돌릴 파일을 지정하세요.');
  if (!opt.map) fail('--map <대응표> 가 필요합니다.');
  if (opt.out && files.length > 1) fail('--out 은 파일이 하나일 때만 쓸 수 있습니다.');
  const { entries } = loadMap(opt.map);
  for (const file of files) {
    const { text } = readText(file);
    const r = unveil(text, entries, { loose: opt.loose });
    const outPath = opt.out || derivePath(file, 'unveiled');
    writeText(outPath, r.text, opt.force);
    const total = Object.values(r.replaced).reduce((a, b) => a + b, 0);
    console.log(`복원한 파일: ${outPath}`);
    console.log(`  토큰 ${Object.keys(r.replaced).length}종 / ${total}곳을 원문으로 되돌림${r.josaFixed ? ` (조사 ${r.josaFixed}곳을 받침에 맞게 고침)` : ''}`);
    const unknown = Object.keys(r.unknown);
    if (unknown.length) console.log(`  ⚠ 대응표에 없는 토큰: ${unknown.join(', ')} — AI가 새로 만든 토큰일 수 있습니다. 그대로 두었습니다.`);
    const bare = Object.keys(r.bare);
    if (bare.length) {
      console.log(opt.loose
        ? `  대괄호 없는 토큰도 복원함: ${bare.join(', ')}`
        : `  ⚠ 대괄호가 빠진 토큰이 있습니다: ${bare.map((b) => b.slice(1, -1)).join(', ')} — 복원하려면 --loose`);
    }
  }
}

function cmdCheck(files, opt) {
  if (files.length !== 1) fail('check 는 파일 하나만 받습니다.');
  const { text } = readText(files[0]);
  const entries = opt.map ? loadMap(opt.map).entries : [];
  const leak = checkLeak(text, entries, buildOptions(opt).allow);
  console.log(`검사: ${files[0]}${opt.map ? ` (대응표 ${opt.map} 대조)` : ' (패턴 검사만 — 대응표를 주면 더 정확합니다)'}`);
  printLeak(leak, false);
  // 참고: 일반 탐지(회사·인명 등) 후보 수
  const soft = detect(text, buildOptions(opt)).filter((d) => !d.uncertain);
  if (!opt.map && soft.length) console.log(`참고: 회사명·인명·금액 등 가릴 만한 후보 ${soft.length}곳이 보입니다 (detect 로 확인).`);
  process.exit(leak.clean ? 0 : 2);
}

// ───────────── main ─────────────

const { cmd, files, opt } = parseArgs(process.argv.slice(2));
if (!cmd || opt.help || cmd === 'help' || cmd === '--help') {
  console.log(HELP);
  process.exit(0);
}
switch (cmd) {
  case 'types': cmdTypes(); break;
  case 'detect': await cmdDetect(files, opt); break;
  case 'veil': await cmdVeil(files, opt); break;
  case 'unveil': cmdUnveil(files, opt); break;
  case 'check': cmdCheck(files, opt); break;
  default: fail(`알 수 없는 명령: ${cmd}\n\n${HELP}`);
}
