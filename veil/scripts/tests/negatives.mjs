// 오탐 방지 — 민감정보가 없는 문장에서는 아무것도 잡지 않아야 한다
import { expectNone, table } from './helpers.mjs';

export default function ({ test, section }) {
  section('오탐 방지');
  table(test, '없음', [
    ['저는 정말 좋아요'],
    ['담당자는 정해지지 않았다'],
    ['전용선 구축, 전 세계 사용자가 늘었다'],
    ['이름은 나중에 정하자'],
    ['비밀번호를 변경했습니다'],
    ['password reset link sent'],
    ['토큰 사용량이 늘었다'],
    ['정리하면 고객사를 2곳 더 늘리자'],
    ['우리 그룹은 TASK 관리를 Jira로 한다'],
    ['신용카드 결제 비율이 올랐다'],
    ['The Group agreed that our team will finalize the roadmap by Friday'],
    ['version 1.2.3 released, build 20260117'],
    ['회의실로 3시에 모이고 본사로 10명 이동'],
    ['commit 9f8e7d6c5b4a39281706abcdef0123456789abcd merged'],
    ['order 4111111111111112 shipped'],
    ['12:30:45 로그 확인'],
    ['진행률 85%, 전년 대비 12% 증가'],
    ['자세한 내용은 https://example.com/docs?page=2 참고'],
  ], (text) => expectNone(text));
}
