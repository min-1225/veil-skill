// 토큰화 · 복원 · 유출 검사
// 원본: VeilNote backend/src/shared/tokenizer.js, leakGuard.js / frontend/src/lib/tokenizer.ts

import { detect, findAllOccurrences, HIGH_RISK_TYPES, maskValue } from './detect.mjs';

export const TOKEN_RE = /\[([A-Z][A-Z0-9]*)_(\d+)\]/g;

/**
 * 확정된(겹치지 않는) 탐지 목록으로 텍스트를 토큰화한다.
 * 같은 종류·같은 값은 같은 토큰을 재사용한다. ([PERSON_1] 이 문서 전체에서 같은 사람)
 * @returns {{ veiled: string, entries: Array<{token,type,original,count,sources,uncertain}> }}
 */
export function applyTokens(text, detections, prior = []) {
  const ordered = [...detections].sort((a, b) => a.start - b.start);
  // prior: 기존 대응표 항목. 여러 파일을 같은 대응표로 가릴 때 토큰 번호를 이어서 쓴다.
  const entries = prior.map((e) => ({ ...e, sources: [...(e.sources || [])], count: e.count || 0 }));
  const byKey = new Map(entries.map((e) => [`${e.type}:${e.original}`, e]));
  const counters = {};
  for (const e of entries) {
    const m = /_(\d+)\]$/.exec(e.token);
    if (m) counters[e.type] = Math.max(counters[e.type] || 0, Number(m[1]));
  }

  let out = '';
  let cursor = 0;
  for (const d of ordered) {
    if (d.start < cursor) continue; // 방어적: 겹침 스킵
    out += text.slice(cursor, d.start);
    const key = `${d.type}:${d.value}`;
    let entry = byKey.get(key);
    if (!entry) {
      counters[d.type] = (counters[d.type] || 0) + 1;
      entry = {
        token: `[${d.type}_${counters[d.type]}]`,
        type: d.type,
        original: d.value,
        count: 0,
        sources: [],
        uncertain: true,
      };
      byKey.set(key, entry);
      entries.push(entry);
    }
    entry.count += 1;
    if (!entry.sources.includes(d.source)) entry.sources.push(d.source);
    // 하나라도 확실한 규칙으로 잡혔으면 uncertain 해제
    if (!d.uncertain && d.source !== 'propagate') entry.uncertain = false;
    out += entry.token;
    cursor = d.end;
  }
  out += text.slice(cursor);
  for (const e of entries) if (e.sources.length && e.sources.every((s) => s === 'propagate')) e.uncertain = true;
  return { veiled: out, entries };
}

/**
 * 원문 텍스트를 탐지 → 토큰화한다.
 * opts.prior 에 기존 대응표 항목을 주면, 그 원문들도 사전처럼 다시 찾아 같은 토큰으로 가린다.
 */
export function veil(text, opts = {}) {
  const prior = opts.prior || [];
  const dictionary = { ...(opts.dictionary || {}) };
  for (const e of prior) {
    // 이미 확인을 거친 값이므로 사전과 같은 신뢰도로 다시 찾는다.
    (dictionary[e.type] ||= []).push(e.original);
  }
  const detections = detect(text, { ...opts, dictionary });
  const before = new Map(prior.map((e) => [e.token, e.count || 0]));
  const { veiled, entries } = applyTokens(text, detections, prior);
  const leak = checkLeak(veiled, entries, opts.allow || []);
  // 이번 파일에서 몇 번 가렸는지
  const thisFile = entries
    .map((e) => ({ ...e, countHere: e.count - (before.get(e.token) || 0) }))
    .filter((e) => e.countHere > 0);
  return { veiled, entries, thisFile, leak };
}

/**
 * 가려진 텍스트에 원문이 남았는지 두 겹으로 검사한다.
 *  (A) 대응표의 원본 값이 그대로 남아 있는가  (원본을 아는 쪽만 할 수 있는 정확한 검사)
 *  (B) 대응표가 없어도, 고위험 패턴(주민번호·카드·이메일·전화·계좌)이 남아 있는가
 * 결과에는 원문 대신 마스킹된 미리보기만 담는다.
 */
export function checkLeak(veiledText, entries = [], allow = []) {
  const allowSet = new Set(allow);
  const residualOriginals = [];
  for (const e of entries) {
    const hits = findAllOccurrences(veiledText, e.original).length;
    if (hits > 0) residualOriginals.push({ token: e.token, type: e.type, preview: maskValue(e.original), hits });
  }
  const residualPatterns = detect(veiledText, { types: HIGH_RISK_TYPES })
    .filter((d) => !allowSet.has(d.value))
    .map((d) => ({ type: d.type, preview: maskValue(d.value) }));
  return {
    clean: residualOriginals.length === 0 && residualPatterns.length === 0,
    residualOriginals,
    residualPatterns,
  };
}

// ───────────── 조사 자동 교정 ─────────────
// AI는 토큰의 원래 받침을 모르므로 "[PERSON_1]가" 처럼 쓸 수 있다.
// 복원할 때 원문 마지막 글자의 받침을 보고 이/가, 을/를 등을 맞춰 준다.

// [받침 있을 때, 받침 없을 때]  (긴 것부터 검사)
const JOSA_PAIRS = [
  ['이랑', '랑'], ['이나', '나'], ['이며', '며'], ['이라고', '라고'], ['이란', '란'],
  ['으로', '로'], ['이', '가'], ['은', '는'], ['을', '를'], ['과', '와'], ['아', '야'],
];

/** 마지막 글자의 받침: 'none' | 'rieul'(ㄹ) | 'other' | null(판단 불가) */
function finalConsonant(word) {
  const ch = [...word].pop();
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  if (/[0-9]/.test(ch)) {
    // 영 일 이 삼 사 오 육 칠 팔 구
    return { 0: 'other', 1: 'rieul', 2: 'none', 3: 'other', 4: 'none', 5: 'none', 6: 'other', 7: 'rieul', 8: 'rieul', 9: 'none' }[ch];
  }
  return null; // 영문·기호는 읽는 법에 따라 달라서 건드리지 않는다
}

function fixJosa(original, following) {
  const fc = finalConsonant(original);
  if (!fc) return null;
  // "(이)가" 형태: 괄호 부분은 버리고 뒤 조사를 기준으로 고른다
  const paren = /^\((이|은|을|과|으)\)/.exec(following);
  const rest = paren ? following.slice(paren[0].length) : following;
  for (const [withB, withoutB] of JOSA_PAIRS) {
    for (const cand of [withB, withoutB]) {
      if (!rest.startsWith(cand)) continue;
      const after = rest.slice(cand.length);
      // "으로/로" 이외의 조사는 뒤에 한글이 바로 붙으면 다른 단어일 수 있으니 건드리지 않는다
      if (withB !== '으로' && /^[가-힣]/.test(after)) continue;
      let pick;
      if (withB === '으로') pick = fc === 'other' ? '으로' : '로';
      else pick = fc === 'none' ? withoutB : withB;
      const consumed = (paren ? paren[0].length : 0) + cand.length;
      return { replacement: pick, consumed };
    }
  }
  return null;
}

/** 문자열에서 대응표의 토큰을 원문으로 되돌린다. 토큰 바로 뒤 조사는 원문 받침에 맞춘다. */
export function unveil(text, entries, { loose = false, josa = true } = {}) {
  const map = new Map(entries.map((e) => [e.token, e.original]));
  const replaced = {};
  const unknown = {};
  let josaFixed = 0;

  const replaceWith = (src, re, resolve) => {
    let out = '';
    let last = 0;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      const original = resolve(m);
      out += src.slice(last, m.index);
      last = m.index + m[0].length;
      if (original == null) {
        out += m[0];
        continue;
      }
      out += original;
      if (josa) {
        const fix = fixJosa(original, src.slice(last, last + 6));
        if (fix) {
          const before = src.slice(last, last + fix.consumed);
          if (before !== fix.replacement) josaFixed++;
          out += fix.replacement;
          last += fix.consumed;
        }
      }
    }
    return out + src.slice(last);
  };

  let out = replaceWith(text, new RegExp(TOKEN_RE.source, 'g'), (m) => {
    const tok = m[0];
    if (map.has(tok)) {
      replaced[tok] = (replaced[tok] || 0) + 1;
      return map.get(tok);
    }
    unknown[tok] = (unknown[tok] || 0) + 1;
    return null;
  });

  // 대괄호가 빠진 토큰 (예: PERSON_1님) — 모델이 가끔 괄호를 떼고 쓴다.
  const bareRe = /(?<![\[A-Za-z0-9_])([A-Z][A-Z0-9]*_\d+)(?![\]A-Za-z0-9_])/g;
  const bare = {};
  out = replaceWith(out, bareRe, (m) => {
    const tok = `[${m[1]}]`;
    if (!map.has(tok)) return null;
    bare[tok] = (bare[tok] || 0) + 1;
    return loose ? map.get(tok) : null;
  });

  const missing = entries.filter((e) => !replaced[e.token] && !(loose && bare[e.token])).map((e) => e.token);
  return { text: out, replaced, unknown, bare, missing, josaFixed };
}

/** 입력에 이미 [XXX_1] 형태 문자열이 있으면 복원 시 헷갈리므로 경고용으로 찾는다. */
export function findPreexistingTokens(text) {
  return [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[0]))];
}
