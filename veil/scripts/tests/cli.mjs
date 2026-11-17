// 명령줄 도구 — 실제로 veil.mjs 를 실행해서 파일·종료 코드를 확인한다
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'veil.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

export default function ({ test, section }) {
  section('명령줄 도구');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veil-test-'));
  const src = path.join(dir, 'note.txt');
  fs.writeFileSync(src, '김철수 팀장 연락처 010-1234-5678, 주민번호 900101-1234567\n', 'utf8');
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

  try {
    test('detect 는 파일을 만들지 않고, 원문 대신 마스킹해서 보여준다', () => {
      const r = run(dir, 'detect', 'note.txt');
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(fs.readdirSync(dir).sort(), ['note.txt']);
      assert.ok(!r.stdout.includes('김철수') && !r.stdout.includes('010-1234-5678'), r.stdout);
    });
    test('veil <파일> 은 가린 파일을 만들고, 대응표를 .veil/ 에 git 제외 설정과 함께 보관한다', () => {
      const r = run(dir, 'note.txt');
      assert.equal(r.status, 0, r.stderr);
      assert.equal(read('note.veiled.txt'), '[PERSON_1] 팀장 연락처 [PHONE_1], 주민번호 [RRN_1]\n');
      assert.ok(fs.existsSync(path.join(dir, '.veil', 'map.json')));
      assert.match(read('.veil/.gitignore'), /^\*$/m);
      assert.ok(!r.stdout.includes('김철수'), r.stdout);
    });
    test('veil <결과물> 은 대응표를 알아서 찾아 되돌리고 조사를 받침에 맞춘다', () => {
      fs.writeFileSync(path.join(dir, 'sum.md'), '[PERSON_1]이 [RRN_1] 확인\n', 'utf8');
      const r = run(dir, 'sum.md');
      assert.equal(r.status, 0, r.stderr);
      assert.equal(read('sum.unveiled.md'), '김철수가 900101-1234567 확인\n');
    });
    test('하위 폴더의 결과물도 상위 폴더의 대응표로 되돌린다', () => {
      fs.mkdirSync(path.join(dir, 'out'));
      fs.writeFileSync(path.join(dir, 'out', 'a.md'), '담당: [PERSON_1]\n', 'utf8');
      assert.equal(run(dir, path.join('out', 'a.md')).status, 0);
      assert.equal(read('out/a.unveiled.md'), '담당: 김철수\n');
    });
    test('다시 실행하면 같은 토큰으로 덮어쓰고, 같은 폴더의 다른 파일도 대응표를 이어 쓴다', () => {
      assert.equal(run(dir, 'note.txt').status, 0);
      fs.writeFileSync(path.join(dir, 'memo.txt'), '김철수 팀장과 박지영 대리 통화\n', 'utf8');
      assert.equal(run(dir, 'memo.txt').status, 0);
      assert.equal(read('memo.veiled.txt'), '[PERSON_1] 팀장과 [PERSON_2] 대리 통화\n');
    });
    test('예전 방식(--map 직접 지정)도 그대로 동작한다', () => {
      assert.equal(run(dir, 'veil', 'note.txt', '--map', 'old.veilmap.json').status, 0);
      assert.ok(fs.existsSync(path.join(dir, 'old.veilmap.json')));
      fs.writeFileSync(path.join(dir, 'x.md'), '[PHONE_1]\n', 'utf8');
      assert.equal(run(dir, 'unveil', 'x.md', '--map', 'old.veilmap.json').status, 0);
      assert.equal(read('x.unveiled.md'), '010-1234-5678\n');
    });
    test('check: 원문은 종료 코드 2, 가린 파일은 0 (대응표 자동 대조)', () => {
      assert.equal(run(dir, 'check', 'note.txt').status, 2);
      assert.equal(run(dir, 'check', 'note.veiled.txt').status, 0);
    });
    test('CP949(EUC-KR) 파일도 읽고 UTF-8 로 저장한다', () => {
      // "김철수 팀장" 을 CP949 로 인코딩한 바이트
      fs.writeFileSync(path.join(dir, 'cp.txt'), Buffer.from([0xb1, 0xe8, 0xc3, 0xb6, 0xbc, 0xf6, 0x20, 0xc6, 0xc0, 0xc0, 0xe5, 0x0a]));
      const r = run(dir, 'cp.txt');
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.includes('euc-kr'), r.stdout);
      assert.equal(read('cp.veiled.txt'), '[PERSON_1] 팀장\n');
    });
    test('인자 없이 실행하면 짧은 사용법, 오타·없는 파일은 종료 코드 1', () => {
      const r = run(dir);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /veil <파일>/);
      assert.equal(run(dir, 'bogus').status, 1);
      assert.equal(run(dir, 'nope.txt').status, 1);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
