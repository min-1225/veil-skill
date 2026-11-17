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

Node.js 18 이상이 필요합니다. 기본 기능은 외부 패키지를 쓰지 않습니다.
선택 기능인 NER 모드(`--ner`)를 쓰려면 `veilnote/scripts` 폴더에서 `npm install`을 한 번 실행하세요.

## 가리는 정보

| 종류 | 예 | 기본 |
|---|---|---|
| `RRN` 주민·외국인등록번호 | 900101-1234567 | ✓ |
| `SSN` 미국 사회보장번호 | 123-45-6789 | ✓ |
| `PASSPORT` 여권번호 | Passport no. X12345678 | ✓ |
| `CARD` 카드번호 (체크섬 검증) | 4111 1111 1111 1111 | ✓ |
| `EMAIL` 이메일 | name@example.com | ✓ |
| `PHONE` 전화번호 | 010-1234-5678, +1 (415) 555-0132, 090-1234-5678 | ✓ |
| `ACCOUNT` 계좌번호·IBAN | 110-123-456789, DE89 3704 0044 0532 0130 00 | ✓ |
| `IP` IP 주소 | 192.168.0.10, 2001:db8::8a2e:370:7334 | ✓ |
| `ADDRESS` 주소 | 판교역로 235 3층, 1600 Amphitheatre Parkway, 〒100-0005, 北京市朝阳区建国路88号 | ✓ |
| `AMOUNT` 금액 | 3억 2천만원, $50,000, €250,000, ¥3,000,000, 500万元 | ✓ |
| `ORG` 회사·기관명 | ㈜한빛테크, Acme Corp., 株式会社サンプル, 华为技术有限公司 | ✓ |
| `PERSON` 인명 | 김철수 팀장, Dr. Laura Mendes, 田中さん, 王伟先生 | ✓ |
| `LOCATION` 지명 | Berlin, Paris (`--ner`에서만) | ✓ |
| `DATE` 날짜 | 2026년 3월 5일, Nov 17, 2026 | 꺼짐 |

사전 파일(`--dict`)로 프로젝트 코드명처럼 원하는 종류를 직접 추가할 수 있고, 잘못 잡힌 단어는 `--allow`로 뺄 수 있습니다.

## 언어 지원

- **규칙 기반 (설치 불필요)**: 한국어, 영어, 일본어, 중국어. 이메일, 카드, IBAN, 국제전화, 외화처럼 형식이 정해진 정보는 언어와 상관없이 잡습니다.
- **NER 모드 (`--ner`, 선택)**: 로컬에서 도는 다국어 개체명 인식 모델로 영어, 독일어, 프랑스어, 스페인어, 이탈리아어, 포르투갈어, 네덜란드어, 라트비아어, 아랍어, 중국어의 이름·회사·지명을 문맥으로 찾습니다. 직함 없이 나오는 `Sarah said…` 같은 이름도 잡아요.
  - 모델은 내 컴퓨터에서만 돕니다. 첫 실행 때 모델 파일(약 170MB)만 받고, 문서 내용은 어디에도 보내지 않습니다.
  - 규칙이 먼저이고 NER은 빈자리만 채웁니다. 규칙이 잡은 주소 전체를 NER이 쪼개지 않습니다.

```
규칙만:   Quick sync. Sarah said Michael talked to Northwind about the Berlin office.
--ner:    Quick sync. [PERSON_1] said [PERSON_2] talked to [ORG_1] about the [LOCATION_1] office.
```

## 특징

- **한 번 잡히면 문서 전체에서 가립니다.** "김철수 팀장"으로 잡힌 이름은 "김철수랑"처럼 패턴에 안 걸리는 곳에서도 같은 토큰이 됩니다.
- **여러 파일이 대응표 하나를 같이 씁니다.** 파일이 달라도 같은 사람은 같은 토큰입니다.
- **되돌릴 때 조사를 맞춥니다.** AI가 `[PERSON_1]이`라고 써도 원문 받침을 보고 `김철수가`로 고칩니다.
- **유출 검사를 합니다.** 가린 결과에 원문이나 주민번호·카드번호 같은 고위험 패턴이 남으면 경고합니다.
- **화면에 원문을 띄우지 않습니다.** 명령 출력은 `김**`처럼 첫 글자만 보여줍니다.
- **CP949(EUC-KR) 메모장 파일도 읽습니다.**
- **체크섬으로 오탐을 줄입니다.** 카드번호(Luhn)와 IBAN(mod 97)은 체크섬이 맞을 때만 확실한 항목으로 봅니다.

## 직접 실행

```bash
node veilnote/scripts/veil.mjs detect 회의록.txt            # 미리보기
node veilnote/scripts/veil.mjs veil 회의록.txt              # 가리기 → 회의록.veiled.txt + 회의록.veilmap.json
node veilnote/scripts/veil.mjs veil report.txt --ner        # NER 모델도 함께 사용
node veilnote/scripts/veil.mjs unveil 요약.md --map 회의록.veilmap.json   # 되돌리기
node veilnote/scripts/veil.mjs check 보낼파일.md --map 회의록.veilmap.json  # 유출 검사
node veilnote/scripts/selftest.mjs                          # 자체 테스트 (--ner 를 붙이면 모델까지)
```

## 한계

- 규칙·사전 기반이라 완벽하지 않습니다. 직함 없이 이름만 나오거나 목록에 없는 회사명은 놓칠 수 있습니다. 영어·유럽어 문서라면 `--ner`를 켜고, 민감한 문서는 사전 파일을 함께 쓰고 가린 결과를 한 번 훑어보세요.
- NER 모델은 한국어·일본어에 약해서, 두 언어에서 직함 없이 나오는 이름은 사전으로 보완해야 합니다.
- 채팅창에 원문을 붙여넣으면 AI는 이미 원문을 본 상태입니다. AI에게서 숨기려면 파일 경로로 넘기세요.
- `.docx`, `.pdf`, `.hwp`는 먼저 텍스트 파일로 바꿔야 합니다.
- 대응표(`*.veilmap.json`)에는 원문이 들어 있습니다. 공유하거나 커밋하지 마세요.

## 출처

탐지·토큰화 엔진의 바탕은 TRACEGATE 팀의 CodeGate 2026 해커톤 프로젝트 VeilNote입니다 ([팀 원본](https://github.com/TRACEGATE/hackathon_2026), [포트폴리오 미러](https://github.com/min-1225/Hackathon-CodeGate-2026)). 원본 프로젝트의 라이선스는 아직 정해지지 않았습니다.
