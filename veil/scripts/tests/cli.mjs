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

  try {
    test('detect 는 파일을 만들지 않고, 원문 대신 마스킹해서 보여준다', () => {
      const r = run(dir, 'detect', 'note.txt');
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(fs.readdirSync(dir).sort(), ['note.txt']);
      assert.ok(!r.stdout.includes('김철수') && !r.stdout.includes('010-1234-5678'), r.stdout);
    });
    test('veil 은 가린 파일과 대응표를 만들고, 다시 실행하면 덮어쓰기를 거부한다', () => {
      assert.equal(run(dir, 'veil', 'note.txt').status, 0);
      const veiled = fs.readFileSync(path.join(dir, 'note.veiled.txt'), 'utf8');
      assert.equal(veiled, '[PERSON_1] 팀장 연락처 [PHONE_1], 주민번호 [RRN_1]\n');
      assert.ok(fs.existsSync(path.join(dir, 'note.veilmap.json')));
      assert.equal(run(dir, 'veil', 'note.txt').status, 1);
    });
    test('unveil 은 토큰을 되돌리고 조사를 받침에 맞춘다', () => {
      fs.writeFileSync(path.join(dir, 'sum.md'), '[PERSON_1]이 [RRN_1] 확인\n', 'utf8');
      assert.equal(run(dir, 'unveil', 'sum.md', '--map', 'note.veilmap.json').status, 0);
      assert.equal(fs.readFileSync(path.join(dir, 'sum.unveiled.md'), 'utf8'), '김철수가 900101-1234567 확인\n');
    });
    test('check: 원문은 종료 코드 2, 가린 파일은 0', () => {
      assert.equal(run(dir, 'check', 'note.txt', '--map', 'note.veilmap.json').status, 2);
      assert.equal(run(dir, 'check', 'note.veiled.txt', '--map', 'note.veilmap.json').status, 0);
    });
    test('CP949(EUC-KR) 파일도 읽고 UTF-8 로 저장한다', () => {
      // "김철수 팀장" 을 CP949 로 인코딩한 바이트
      fs.writeFileSync(path.join(dir, 'cp.txt'), Buffer.from([0xb1, 0xe8, 0xc3, 0xb6, 0xbc, 0xf6, 0x20, 0xc6, 0xc0, 0xc0, 0xe5, 0x0a]));
      const r = run(dir, 'veil', 'cp.txt');
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.includes('euc-kr'), r.stdout);
      assert.equal(fs.readFileSync(path.join(dir, 'cp.veiled.txt'), 'utf8'), '[PERSON_1] 팀장\n');
    });
    test('잘못된 명령·없는 파일은 종료 코드 1', () => {
      assert.equal(run(dir, 'bogus').status, 1);
      assert.equal(run(dir, 'veil', 'nope.txt').status, 1);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
