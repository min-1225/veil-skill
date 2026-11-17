# veilnote-skill

글 속 민감정보를 `[PERSON_1]`, `[ORG_1]` 같은 토큰으로 가리고, 작업이 끝나면 원문으로 되돌리는 Claude Code 스킬입니다.

원문과 대응표는 내 컴퓨터에만 두고, AI에는 가려진 글만 보여주는 것이 핵심입니다. CodeGate 2026 해커톤 프로젝트 [VeilNote](https://github.com/min-1225/Hackathon-CodeGate-2026)의 토큰화 엔진을 스킬로 옮기고 보강했습니다.

```
원문 파일 ──veil──▶ 가린 파일 (AI가 읽음) ──작업──▶ 토큰이 든 결과물 ──unveil──▶ 실명 결과물
   └──────────────▶ 대응표 .veilmap.json (원문 포함, 로컬에만)
```

## 예시

```
원문:  김철수 팀장이 삼성전자 납품 단가를 3억 2천만원으로 제안. 연락처 010-1234-5678
가림:  [PERSON_1] 팀장이 [ORG_1] 납품 단가를 [AMOUNT_1]으로 제안. 연락처 [PHONE_1]
```

Claude Code에서 이렇게 말하면 스킬이 동작합니다.

> 상담기록.txt 팀장님 보고용으로 요약해줘. 고객 개인정보는 AI한테 안 넘어가게 하고, 마지막엔 실명 버전도 만들어줘

## 설치

```bash
npx skills add min-1225/veilnote-skill
```

또는 직접 복사:

```bash
git clone https://github.com/min-1225/veilnote-skill.git
cp -r veilnote-skill/veilnote ~/.claude/skills/
```

Node.js 18 이상이 필요합니다. 외부 패키지는 쓰지 않습니다.

## 가리는 정보

| 종류 | 예 | 기본 |
|---|---|---|
| `RRN` 주민·외국인등록번호 | 900101-1234567 | ✓ |
| `CARD` 카드번호 | 1234-5678-9012-3456 | ✓ |
| `EMAIL` 이메일 | name@example.com | ✓ |
| `PHONE` 전화번호 | 010-1234-5678, 1588-1234 | ✓ |
| `ACCOUNT` 계좌번호 | 110-123-456789 | ✓ |
| `IP` IP 주소 | 192.168.0.10 | ✓ |
| `ADDRESS` 주소 | 경기도 성남시 분당구 판교역로 235 3층 | ✓ |
| `AMOUNT` 금액 | 3억 2천만원, $50,000 | ✓ |
| `ORG` 회사·기관명 | ㈜한빛테크, 라온소프트, 경쟁사 OO | ✓ |
| `PERSON` 인명 | 김철수 팀장, 참석: 박지영 | ✓ |
| `DATE` 날짜 | 2026년 3월 5일 | 꺼짐 |

사전 파일(`--dict`)로 프로젝트 코드명처럼 원하는 종류를 직접 추가할 수 있고, 잘못 잡힌 단어는 `--allow`로 뺄 수 있습니다.

## 특징

- **한 번 잡히면 문서 전체에서 가립니다.** "김철수 팀장"으로 잡힌 이름은 "김철수랑"처럼 패턴에 안 걸리는 곳에서도 같은 토큰이 됩니다.
- **여러 파일이 대응표 하나를 같이 씁니다.** 파일이 달라도 같은 사람은 같은 토큰입니다.
- **되돌릴 때 조사를 맞춥니다.** AI가 `[PERSON_1]이`라고 써도 원문 받침을 보고 `김철수가`로 고칩니다.
- **유출 검사를 합니다.** 가린 결과에 원문이나 주민번호·카드번호 같은 고위험 패턴이 남으면 경고합니다.
- **화면에 원문을 띄우지 않습니다.** 명령 출력은 `김**`처럼 첫 글자만 보여줍니다.
- **CP949(EUC-KR) 메모장 파일도 읽습니다.**

## 직접 실행

```bash
node veilnote/scripts/veil.mjs detect 회의록.txt            # 미리보기
node veilnote/scripts/veil.mjs veil 회의록.txt              # 가리기 → 회의록.veiled.txt + 회의록.veilmap.json
node veilnote/scripts/veil.mjs unveil 요약.md --map 회의록.veilmap.json   # 되돌리기
node veilnote/scripts/veil.mjs check 보낼파일.md --map 회의록.veilmap.json  # 유출 검사
node veilnote/scripts/selftest.mjs                          # 자체 테스트
```

## 한계

- 규칙·사전 기반이라 완벽하지 않습니다. 직함 없이 이름만 나오거나 목록에 없는 회사명은 놓칠 수 있습니다. 민감한 문서는 사전 파일을 함께 쓰고 가린 결과를 한 번 훑어보세요.
- 채팅창에 원문을 붙여넣으면 AI는 이미 원문을 본 상태입니다. AI에게서 숨기려면 파일 경로로 넘기세요.
- `.docx`, `.pdf`, `.hwp`는 먼저 텍스트 파일로 바꿔야 합니다.
- 대응표(`*.veilmap.json`)에는 원문이 들어 있습니다. 공유하거나 커밋하지 마세요.

## 출처

탐지·토큰화 엔진의 바탕은 TRACEGATE 팀의 CodeGate 2026 해커톤 프로젝트 VeilNote입니다 ([팀 원본](https://github.com/TRACEGATE/hackathon_2026), [포트폴리오 미러](https://github.com/min-1225/Hackathon-CodeGate-2026)). 원본 프로젝트의 라이선스는 아직 정해지지 않았습니다.
