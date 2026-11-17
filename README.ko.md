<div align="center">

# 🎭 Veil

**AI가 보기 전에 가리고, 작업이 끝나면 되돌린다.**

이름·회사·전화번호·신분번호 같은 민감정보를 `[PERSON_1]` 같은 토큰으로 바꿔서 Claude가 가린 글로만 작업하게 하고,<br>
결과물은 내 컴퓨터에서 원래 값으로 되돌리는 Claude Code 스킬입니다.

[![tests](https://github.com/min-1225/veil-skill/actions/workflows/test.yml/badge.svg)](https://github.com/min-1225/veil-skill/actions/workflows/test.yml)
![Claude Code skill](https://img.shields.io/badge/Claude%20Code-skill-D97757)
![Node 18+](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![zero dependencies](https://img.shields.io/badge/core-zero%20dependencies-blue)
![languages](https://img.shields.io/badge/languages-KO%20%C2%B7%20EN%20%C2%B7%20JA%20%C2%B7%20ZH%20%2B%20NER-8A2BE2)

[English](README.md) · **한국어**

</div>

```diff
- 김철수 팀장이 ㈜한빛테크에 3억 2천만원을 제안했다. 연락처 010-1234-5678
+ [PERSON_1] 팀장이 ㈜[ORG_1]에 [AMOUNT_1]을 제안했다. 연락처 [PHONE_1]

- CEO John Smith wants Acme Corp. to pay €250,000 to DE89 3704 0044 0532 0130 00.
+ CEO [PERSON_2] wants [ORG_2] to pay [AMOUNT_2] to [ACCOUNT_1].
```

## 왜 필요한가요

상담 기록 요약, HR 메일 초안, 계약 메모 정리는 AI에게 맡기고 싶어요.
하지만 고객 전화번호, 직원 연봉, 거래처 이름이 내 컴퓨터 밖으로 나가는 건 싫죠.

Veil은 **내 컴퓨터에서만** 동작합니다. 원문 파일과 대응표는 AI에게 가지 않아요. Claude는 가린 사본만 읽고 토큰 그대로 작업하며, 마지막에 Veil이 진짜 값을 다시 넣습니다.

## 30초 시작

```bash
npx skills add min-1225/veil-skill
```

그다음 Claude Code에 평소처럼 말하면 됩니다.

> `상담기록.txt` 팀장님 보고용으로 요약해줘. 고객 개인정보는 AI한테 안 넘어가게 하고, 마지막엔 실명 버전도 만들어줘

`/veil`로 직접 불러도 됩니다.

> [!TIP]
> 글을 붙여넣지 말고 **파일 경로**로 주세요. 붙여넣은 글은 이미 대화에 들어간 상태라, Veil이 공유용으로 가려줄 수는 있어도 AI에게서 숨기지는 못합니다.

## 동작 방식

```mermaid
flowchart LR
    A[원문 파일] -->|veil| B[가린 파일]
    A -->|veil| M[(대응표<br/>내 컴퓨터에만)]
    B -->|Claude가 읽고 작업| C[토큰이 든 결과물]
    C -->|unveil| D[실명 결과물]
    M -.-> D
```

1. **탐지**: 규칙, 사전, (선택) 로컬 NER 모델로 민감한 부분을 찾습니다.
2. **가리기**: 값마다 고정 토큰을 붙입니다. 같은 사람은 문서 전체, 여러 파일에 걸쳐서도 계속 `[PERSON_1]`입니다.
3. **작업**: Claude는 `*.veiled.*` 파일만 읽고 토큰을 건드리지 않습니다.
4. **되돌리기**: 토큰을 원래 값으로 바꿉니다. 조사(이/가, 을/를…)는 원문 받침에 맞게 고쳐집니다.
5. **유출 검사**: 원문 값이나 고위험 패턴이 남아 있으면 경고합니다.

## 가리는 정보

| 종류 | 예 |
|---|---|
| `PERSON` 인명 | 김철수 팀장, 저는 김민수이고, 참석: 박지영, Dr. Laura Mendes, 田中さん, 王伟先生 |
| `ORG` 회사·기관 | ㈜한빛테크, 라온소프트, 경쟁사 OO, Acme Corp., 株式会社サンプル, 华为技术有限公司 |
| `EMAIL` · `PHONE` | name@example.com, 010-1234-5678, +1 (415) 555-0132, 090-1234-5678 |
| `RRN` · `SSN` · `PASSPORT` | 900101-1234567, 123-45-6789, 여권번호 M12345678 |
| `CARD` · `ACCOUNT` | 카드번호(Luhn 검증), IBAN(mod 97 검증), 110-123-456789 |
| `ADDRESS` 주소 | 경기도 성남시 분당구 판교역로 235 3층, 1600 Amphitheatre Parkway, 〒100-0005, 北京市朝阳区建国路88号 |
| `AMOUNT` 금액 | 3억 2천만원, $50,000, €250,000, ¥3,000,000, 500万元 |
| `SECRET` 비밀정보 | 비밀번호: Hunter2!pass, sk-proj-…, ghp_…, AKIA…, JWT, postgresql://user:pass@host (주소 전체) |
| `EMPLOYEE_ID` 사번 | 사번 EMP-20431, Employee ID: 004512 |
| `IP` | 192.168.0.10, 2001:db8::8a2e:370:7334 |
| `LOCATION` 지명 | Berlin, Paris (`--ner`에서만) |
| `DATE` 날짜 | 2026년 3월 5일, Nov 17, 2026 (기본 꺼짐) |

프로젝트 코드명이나 신규 고객사처럼 꼭 가려야 할 단어는 사전 파일(`--dict`)에 넣고, 잘못 잡힌 단어는 `--allow`로 뺄 수 있습니다.

## 언어 지원

| | 규칙 (설치 불필요) | `--ner` (선택, 로컬 모델) |
|---|---|---|
| 한국어 | ✅ 인명·회사·주소·주민번호 | – |
| 영어 | ✅ 직함 붙은 이름, `Attendees:` 목록, Inc./Ltd./GmbH, 미국·영국 주소 | ✅ 직함 없는 이름, 처음 보는 회사, 지명 |
| 일본어 | ✅ さん/様/部長, 株式会社, 〒 주소 | – |
| 중국어 | ✅ 先生/女士/经理, 有限公司, 省市区路号 | ✅ |
| 독일어·프랑스어·스페인어·이탈리아어·포르투갈어·네덜란드어·라트비아어·아랍어 | 형식만 (이메일·전화·IBAN·카드 등) | ✅ |

```
규칙만:  Sarah said Michael talked to Northwind about the Berlin office.
--ner:   [PERSON_1] said [PERSON_2] talked to [ORG_1] about the [LOCATION_1] office.
```

`--ner`는 Transformers.js로 [`Xenova/bert-base-multilingual-cased-ner-hrl`](https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl) 모델을 내 컴퓨터에서 돌립니다. 처음 한 번 모델 파일(약 170MB)만 내려받고, 문서 내용은 어디에도 보내지 않습니다. 규칙이 항상 우선이라, NER은 규칙이 놓친 빈자리만 채우고 주소 전체 같은 긴 덩어리를 쪼개지 않습니다.

## 특징

- 🔒 **로컬 전용**: 가리기·대응표·되돌리기가 모두 내 컴퓨터에서 일어납니다. 명령 출력에도 `김**`처럼 첫 글자만 나옵니다.
- 🔁 **되돌릴 수 있음**: 단순 마스킹과 달리 최종 결과물에서 진짜 값을 돌려받습니다.
- 🧩 **일관된 토큰**: 한 번 잡힌 값은 `김철수랑`처럼 패턴에 안 걸리는 곳까지 모두 가려지고, 대응표를 공유하면 파일이 달라도 토큰이 같습니다.
- 🧮 **체크섬 검증**: 카드번호(Luhn)와 IBAN(mod 97)으로 오탐을 줄입니다.
- 🚨 **유출 검사**: 보내기 전에 `check`로 원문이나 고위험 패턴이 남았는지 확인합니다.
- 🇰🇷 **한국어 특화**: 복원 시 조사 자동 교정, CP949 메모장 파일, 성씨+직함 인명 규칙.
- 📦 **기본 기능은 의존성 0개**: NER만 선택해서 `npm install`.

## 직접 실행

```bash
node veil/scripts/veil.mjs detect 회의록.txt                      # 미리보기 (파일 안 만듦)
node veil/scripts/veil.mjs veil 회의록.txt                        # → 회의록.veiled.txt + 회의록.veilmap.json
node veil/scripts/veil.mjs veil report.txt --ner                  # + 로컬 NER 모델
node veil/scripts/veil.mjs veil 1월.txt 2월.txt --map 프로젝트.veilmap.json   # 여러 파일, 대응표 하나
node veil/scripts/veil.mjs unveil 요약.md --map 회의록.veilmap.json       # 되돌리기
node veil/scripts/veil.mjs check 보낼파일.md --map 회의록.veilmap.json    # 유출 검사 (종료 코드 2 = 남음)
node veil/scripts/veil.mjs types                                  # 탐지 종류 목록
```

옵션: `--dict dict.json`, `--allow "법무팀,본사"`, `--add-types DATE`, `--skip-types AMOUNT`, `--force`, `--loose`. 전체 목록은 `--help`.

NER을 쓰려면: `cd veil/scripts && npm install`

## 자주 묻는 질문

**Claude가 원문을 보게 되나요?**
파일 경로로 주면 보지 않습니다. 스킬은 Claude에게 가린 사본만 읽고 원문·대응표·복원 파일은 열지 말라고 안내합니다. 탐지가 놓친 게 있으면 Claude가 다시 가리고, 무엇을 봤는지 사용자에게 알려줍니다.

**탐지가 완벽한가요?**
아닙니다. 규칙과 사전, 선택 모델로 동작합니다. 직함 없이 나오는 이름이나 처음 보는 회사명은 놓칠 수 있고, 한국어·일본어에서 특히 그렇습니다. `detect`로 미리 보고, 중요한 단어는 사전에 넣고, 정말 민감한 문서는 가린 파일을 한 번 훑어보세요.

**대응표는 어디에 있나요?**
원본 옆에 `*.veilmap.json`으로 생깁니다. 원문이 들어 있으니 공유하거나 커밋하지 마세요. 이 레포의 `.gitignore`에는 이미 빠져 있습니다.

**`--ner`가 내 글을 어딘가로 보내나요?**
아니요. 모델은 Transformers.js로 내 컴퓨터에서 돕니다. 네트워크는 처음 한 번 Hugging Face에서 모델을 받을 때만 씁니다.

## 테스트

```bash
node veil/scripts/selftest.mjs          # 33개: 탐지·토큰화·복원·유출 검사
node veil/scripts/selftest.mjs --ner    # + 실제 NER 모델
```

## 출처

Veil은 TRACEGATE 팀이 코드게이트 2026 AI 스타트업 해커톤에서 만든 개인정보 보호 회의록 에이전트 **VeilNote**에서 출발했습니다 ([팀 원본](https://github.com/TRACEGATE/hackathon_2026), [포트폴리오 미러](https://github.com/min-1225/Hackathon-CodeGate-2026)). 탐지·토큰화 엔진을 그곳에서 가져와 이 스킬에 맞게 확장했습니다.

라이선스는 아직 정해지지 않았습니다.
