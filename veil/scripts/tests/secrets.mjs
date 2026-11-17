// 비밀 정보 — API 키·토큰, 비밀번호, 접속 주소, 사번
import assert from 'node:assert/strict';
import { expectHas, table, values } from './helpers.mjs';

// 테스트용 가짜 키 (실제 키 아님)
const KEYS = {
  'OpenAI 프로젝트 키': 'sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0f',
  'OpenAI 키': 'sk-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z',
  'Anthropic 키': 'sk-ant-api03-AbCdEf123456GhIjKl7890MnOp',
  'GitHub 토큰': 'ghp_1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P7q8R',
  'GitHub fine-grained': 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEF',
  'GitLab 토큰': 'glpat-AbCdEf1234567890xyz_',
  'AWS 액세스 키': 'AKIAIOSFODNN7EXAMPLE',
  'Google API 키': 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
  'Slack 토큰': 'xoxb-123456789012-abcdefABCDEF',
  'Stripe 키': 'sk_live_51HabcdEFGH1234ijkl',
  'Hugging Face 토큰': 'hf_AbCdEfGhIjKlMnOpQrStUvWxYz123456',
  'npm 토큰': 'npm_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  JWT: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
};

export default function ({ test, section }) {
  section('비밀 정보: 접두어로 구분되는 키');
  for (const [name, key] of Object.entries(KEYS)) {
    test(`키: ${name}`, () => {
      const v = values(`key = ${key} 끝`);
      assert.deepEqual(v, [`SECRET:${key}`], v.join(' | '));
    });
  }
  test('키: 개인 키 블록 전체', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY-----';
    assert.deepEqual(values(`설정\n${pem}\n끝`), [`SECRET:${pem}`]);
  });

  section('비밀 정보: 비밀번호·접속 주소·사번');
  table(test, '비밀번호', [
    ['관리자 비밀번호: Hunter2!pass', 'SECRET:Hunter2!pass'],
    ['비번은 qwer1234!이고 바꿔야 함', 'SECRET:qwer1234!'],
    ['password=S3cr3t_v4lue;', 'SECRET:S3cr3t_v4lue'],
    ['PW: abcd#9876', 'SECRET:abcd#9876'],
    ['임시 패스워드 Temp!2026', 'SECRET:Temp!2026'],
  ], expectHas);
  table(test, '접속 주소', [
    ['postgresql://admin:MySecretPassword!2026@db.example.com:5432/prod', 'SECRET:postgresql://admin:MySecretPassword!2026@db.example.com:5432/prod'],
    ['mysql://root:p@ss@word@10.0.0.5:3306/app', 'SECRET:mysql://root:p@ss@word@10.0.0.5:3306/app'],
    ['MONGO=mongodb+srv://app:Xy9!k2@cluster0.ab12c.mongodb.net/db', 'SECRET:mongodb+srv://app:Xy9!k2@cluster0.ab12c.mongodb.net/db'],
    ['redis://default:r3d1sPw@cache.internal:6379', 'SECRET:redis://default:r3d1sPw@cache.internal:6379'],
  ], expectHas);
  table(test, '컨텍스트 키·사번', [
    ['API key: AbCdEf1234567890XyZ', 'SECRET:AbCdEf1234567890XyZ'],
    ['token=9f8e7d6c5b4a39281706abcd', 'SECRET:9f8e7d6c5b4a39281706abcd'],
    ['사번은 EMP-20431입니다', 'EMPLOYEE_ID:EMP-20431'],
    ['Employee ID: 004512', 'EMPLOYEE_ID:004512'],
    ['직원번호 A12345 확인', 'EMPLOYEE_ID:A12345'],
  ], expectHas);
}
