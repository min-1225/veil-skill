// 선택 기능: 로컬 NER(개체명 인식) 모델로 사람·회사·지명을 찾는다.
//
// - 모델은 내 컴퓨터에서만 돈다. 처음 한 번 Hugging Face 에서 모델 파일을 내려받을 뿐,
//   문서 내용은 어디로도 보내지 않는다. 받은 모델은 ~/.cache/maskforge-models 에 캐시된다.
// - 필요한 패키지: @huggingface/transformers (scripts 폴더에서 `npm install`)
// - 기본 모델: Xenova/bert-base-multilingual-cased-ner-hrl
//   지원 언어: 영어·독일어·스페인어·프랑스어·이탈리아어·라트비아어·네덜란드어·포르투갈어·아랍어·중국어
//   (한국어·일본어는 규칙 기반 탐지가 담당)

import os from 'node:os';
import path from 'node:path';

export const DEFAULT_NER_MODEL = 'Xenova/bert-base-multilingual-cased-ner-hrl';
const LABEL_TO_TYPE = { PER: 'PERSON', ORG: 'ORG', LOC: 'LOCATION', DATE: 'DATE', MISC: null };
const CHUNK_CHARS = 400; // BERT 입력 한도(512 토큰) 안에 넉넉히 들어가는 크기

export class NerUnavailableError extends Error {}

async function loadTransformers() {
  try {
    return await import('@huggingface/transformers');
  } catch {
    throw new NerUnavailableError(
      'NER 모드에 필요한 패키지가 없습니다. 스킬의 scripts 폴더에서 `npm install` 을 한 번 실행하세요.',
    );
  }
}

/** 문서를 줄·문장 경계에서 잘라 [{text, offset}] 로 만든다 */
export function chunkText(text, max = CHUNK_CHARS) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n'), window.search(/[.!?。！？](?=[^.!?。！？]*$)/));
      if (cut > max * 0.3) end = start + cut + 1;
      else {
        const sp = window.lastIndexOf(' ');
        if (sp > max * 0.3) end = start + sp + 1;
      }
    }
    chunks.push({ text: text.slice(start, end), offset: start });
    start = end;
  }
  return chunks;
}

const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch) && !/[぀-ヿ㐀-鿿]/u.test(ch);

/**
 * 모델이 돌려준 토큰 목록(위치 정보 없음)을 원문 위치로 되돌리고, B-/I- 를 묶어 개체로 만든다.
 * @param {string} text  청크 원문
 * @param {Array<{entity,score,index,word}>} tokens
 */
export function alignTokens(text, tokens) {
  const spans = [];
  let cursor = 0;
  let cur = null;
  let lastIndex = -2;

  for (const t of [...tokens].sort((a, b) => a.index - b.index)) {
    const piece = t.word.startsWith('##') ? t.word.slice(2) : t.word;
    if (!piece || piece === '[UNK]') continue;
    const [bio, label] = t.entity.includes('-') ? t.entity.split('-') : ['B', t.entity];
    const type = LABEL_TO_TYPE[label];

    // 원문에서 이 조각의 위치 찾기 (## 조각은 바로 앞 조각에 붙어 있어야 함)
    let pos;
    if (t.word.startsWith('##') && cur && t.index === lastIndex + 1) {
      pos = text.startsWith(piece, cur.end) ? cur.end : -1;
    } else {
      pos = text.indexOf(piece, cursor);
    }
    if (pos === -1) continue;
    cursor = pos + piece.length;

    const continues = cur && type === cur.type && t.index === lastIndex + 1 && (bio === 'I' || t.word.startsWith('##'));
    if (continues) {
      cur.end = pos + piece.length;
      cur.scores.push(t.score);
    } else {
      if (cur) spans.push(cur);
      cur = type ? { type, start: pos, end: pos + piece.length, scores: [t.score] } : null;
    }
    lastIndex = t.index;
  }
  if (cur) spans.push(cur);

  // 알파벳 단어 중간에서 끊겼으면 단어 끝까지 늘린다 (North + wind 중 wind 가 빠지는 경우 방지)
  return spans.map((s) => {
    let { start, end } = s;
    while (start > 0 && isWordChar(text[start - 1]) && isWordChar(text[start])) start--;
    while (end < text.length && isWordChar(text[end]) && isWordChar(text[end - 1])) end++;
    const score = s.scores.reduce((a, b) => a + b, 0) / s.scores.length;
    return { type: s.type, start, end, score };
  });
}

let cachedPipe = null;
let cachedModel = null;

/**
 * 문서 전체에 NER 을 돌려 [{type, start, end, score}] 를 돌려준다. (원문 값은 담지 않음)
 * @param {string} text
 * @param {{ model?: string, minScore?: number, onProgress?: (msg:string)=>void }} opts
 */
export async function runNer(text, { model = DEFAULT_NER_MODEL, minScore = 0.6, onProgress } = {}) {
  const { pipeline, env } = await loadTransformers();
  env.cacheDir = path.join(os.homedir(), '.cache', 'maskforge-models');
  if (!cachedPipe || cachedModel !== model) {
    onProgress?.(`NER 모델 준비 중: ${model} (처음 한 번은 내려받느라 시간이 걸립니다)`);
    cachedPipe = await pipeline('token-classification', model, { dtype: 'q8' });
    cachedModel = model;
  }
  const out = [];
  for (const chunk of chunkText(text)) {
    if (!chunk.text.trim()) continue;
    const tokens = await cachedPipe(chunk.text);
    for (const s of alignTokens(chunk.text, tokens)) {
      if (s.score < minScore) continue;
      out.push({ ...s, start: s.start + chunk.offset, end: s.end + chunk.offset });
    }
  }
  return out;
}
