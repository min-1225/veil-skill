<div align="center">

# 🎭 Veil

**AI가 보기 전에 가리고, 작업이 끝나면 되돌린다.**

이름·회사·전화번호·신분번호·API 키 같은 민감정보를 `[PERSON_1]` 같은 토큰으로 바꿔서 Claude가 가린 글로만 작업하게 하고,<br>
결과물은 내 컴퓨터에서 원래 값으로 되돌리는 Claude Code 스킬입니다.

[![tests](https://github.com/min-1225/veil-skill/actions/workflows/test.yml/badge.svg)](https://github.com/min-1225/veil-skill/actions/workflows/test.yml)
![runs locally](https://img.shields.io/badge/runs-100%25%20locally-2ea44f)
[![MIT license](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
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

- OPENAI_API_KEY=sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0f
+ OPENAI_API_KEY=[SECRET_1]
```

## 왜 필요한가요

상담 기록 요약, HR 메일 초안, 계약 메모 정리, 설정 파일 점검은 AI에게 맡기고 싶어요.
하지만 고객 전화번호, 직원 연봉, 거래처 이름, API 키가 내 컴퓨터 밖으로 나가는 건 싫죠.

> [!IMPORTANT]
> **Veil은 내 컴퓨터에서 실행됩니다.** 스킬이 하는 일은 스킬 폴더 안의 Node 스크립트를 로컬에서 돌리는 것이고, 가리기·되돌리기·유출 검사가 모두 내 컴퓨터 안에서 끝납니다. 외부 서버나 API를 거치지 않아요. Claude에게 전달되는 건 **가린 사본뿐**이고, 원문 파일과 대응표는 내 컴퓨터를 떠나지 않습니다.

## 10초 시작

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
    subgraph local["💻 내 컴퓨터 — Veil이 로컬에서 실행"]
        A[원문 파일] -->|veil| B[가린 파일]
        A -->|veil| M[(대응표)]
        C[토큰이 든 결과물] -->|unveil| D[실명 결과물]
        M -.-> D
    end
    B -->|가린 글만 전달| CL((Claude))
    CL -->|토큰 그대로 작업| C
```

1. **탐지** (로컬): 규칙, 사전, (선택) 로컬 NER 모델로 민감한 부분을 찾습니다.
2. **가리기** (로컬): 값마다 고정 토큰을 붙입니다. 같은 사람은 문서 전체, 여러 파일에 걸쳐서도 계속 `[PERSON_1]`입니다.
3. **작업**: Claude는 `*.veiled.*` 파일만 읽고 토큰을 건드리지 않습니다.
4. **되돌리기** (로컬): 토큰을 원래 값으로 바꿉니다. 조사(이/가, 을/를…)는 원문 받침에 맞게 고쳐집니다.
5. **유출 검사** (로컬): 원문 값이나 고위험 패턴이 남아 있으면 경고합니다.

## 가리는 정보

| 종류 | 예 |
|---|---|
| `PERSON` 인명 | 김철수 팀장, 저는 김민수이고, 참석: 박지영, 표·CSV의 `이름`·`담당자` 열, JSON `"name"`, Dr. Laura Mendes, 田中さん, 王伟先生 |
| `ORG` 회사·기관 | ㈜한빛테크, 라온소프트, 경쟁사 OO, Acme Corp., 株式会社サンプル, 华为技术有限公司 |
| `EMAIL` · `PHONE` | name@example.com, 010-1234-5678, +1 (415) 555-0132, 090-1234-5678 |
| `SECRET` API 키·비밀정보 | OpenAI `sk-proj-…`, Anthropic `sk-ant-…`, GitHub `ghp_…`, AWS `AKIA…`, Google `AIza…`, Slack·Stripe·Hugging Face 키, JWT, 개인 키, 비밀번호: Hunter2!pass, `postgresql://user:pass@host` (주소 전체) |
| `RRN` · `SSN` · `PASSPORT` | 900101-1234567, 123-45-6789, 여권번호 M12345678 |
| `CARD` · `ACCOUNT` | 카드번호(Luhn 검증), IBAN(mod 97 검증), 110-123-456789 |
| `ADDRESS` 주소 | 경기도 성남시 분당구 판교역로 235 3층, 1600 Amphitheatre Parkway, 〒100-0005, 北京市朝阳区建国路88号 |
| `AMOUNT` 금액 | 3억 2천만원, $50,000, €250,000, ¥3,000,000, 500万元 |
| `EMPLOYEE_ID` 사번 | 사번 EMP-20431, Employee ID: 004512 |
| `IP` | 192.168.0.10, 2001:db8::8a2e:370:7334 |
| `LOCATION` 지명 | Berlin, Paris (`--ner`에서만) |
| `DATE` 날짜 | 2026년 3월 5일, Nov 17, 2026 (기본 꺼짐) |

## 골라서 가리기

전부 가릴 필요가 없을 때는 원하는 것만 고를 수 있어요. Claude Code에서는 "이름이랑 주민번호만 가려줘", "금액은 남겨줘"처럼 말로 하면 스킬이 알맞은 옵션을 붙입니다.

| 하고 싶은 것 | 옵션 | 예 |
|---|---|---|
| 특정 종류만 가리기 | `--types` | `--types PERSON,RRN` → 이름과 주민번호만 가림 |
| 특정 종류는 남기기 | `--skip-types` | `--skip-types AMOUNT` → 금액은 그대로 둠 |
| 기본으로 꺼진 종류 켜기 | `--add-types` | `--add-types DATE` → 날짜도 가림 |
| 특정 단어는 남기기 | `--allow` | `--allow "한빛테크,법무팀"` (가려진 그대로의 글자로 적기) |
| 특정 단어를 추가로 가리기 | `--dict` | `dict.json`: `{"PROJECT":["블루문"]}` |

같은 문장에 옵션을 하나씩 적용한 결과:

```
원문                  김철수 팀장(900101-1234567)이 ㈜한빛테크에 3억원을 제안. 2026년 3월 5일 법무팀 검토. 블루문 프로젝트. 연락처 010-1234-5678
기본                  [PERSON_1] 팀장([RRN_1])이 ㈜[ORG_1]에 [AMOUNT_1]을 제안. 2026년 3월 5일 법무팀 검토. 블루문 프로젝트. 연락처 [PHONE_1]
--types PERSON,RRN    [PERSON_1] 팀장([RRN_1])이 ㈜한빛테크에 3억원을 제안. 2026년 3월 5일 법무팀 검토. 블루문 프로젝트. 연락처 010-1234-5678
--skip-types AMOUNT   [PERSON_1] 팀장([RRN_1])이 ㈜[ORG_1]에 3억원을 제안. 2026년 3월 5일 법무팀 검토. 블루문 프로젝트. 연락처 [PHONE_1]
--add-types DATE      [PERSON_1] 팀장([RRN_1])이 ㈜[ORG_1]에 [AMOUNT_1]을 제안. [DATE_1] 법무팀 검토. 블루문 프로젝트. 연락처 [PHONE_1]
--allow 한빛테크       [PERSON_1] 팀장([RRN_1])이 ㈜한빛테크에 [AMOUNT_1]을 제안. 2026년 3월 5일 법무팀 검토. 블루문 프로젝트. 연락처 [PHONE_1]
--dict dict.json      [PERSON_1] 팀장([RRN_1])이 ㈜[ORG_1]에 [AMOUNT_1]을 제안. 2026년 3월 5일 법무팀 검토. [PROJECT_1] 프로젝트. 연락처 [PHONE_1]
```

- 사전의 종류 이름(`PROJECT`, `PRODUCT` 등)은 자유롭게 정할 수 있고, 사전에 넣은 단어는 어떤 규칙보다 먼저 적용됩니다.
- 전화번호·주민번호·API 키 같은 고위험 정보를 일부러 남기면, 유출 검사가 "남아 있다"고 경고해 줍니다. 의도한 거라면 그대로 두시면 됩니다.
- 옵션은 함께 쓸 수 있어요. 예: `--skip-types AMOUNT --allow "법무팀" --dict dict.json`

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
- 📊 **표·데이터 인식**: CSV·TSV·마크다운 표·JSON·YAML에서 `이름`·`담당자`·`name`·`customer` 같은 열과 키의 값을 가립니다. 설정 파일의 `"name": "my-app"` 같은 값은 건드리지 않아요.
- 🧮 **체크섬 검증**: 카드번호(Luhn)와 IBAN(mod 97)으로 오탐을 줄입니다.
- 🚨 **유출 검사**: 보내기 전에 `check`로 원문이나 고위험 패턴이 남았는지 확인합니다.
- 🇰🇷 **한국어 특화**: 복원 시 조사 자동 교정, CP949 메모장 파일, 성씨+직함 인명 규칙.
- 📦 **기본 기능은 의존성 0개**: NER만 선택해서 `npm install`.

## 로컬에서 직접 실행

스킬이 하는 일은 전부 아래 명령을 **내 컴퓨터에서 실행**하는 것입니다. Claude 없이 터미널에서 써도 똑같이 동작해요.

**설치 (한 번만)**

```bash
npm install -g github:min-1225/veil-skill
```

**사용: 명령은 `veil <파일>` 하나예요**

```bash
veil 회의록.txt      # 가리기 → 회의록.veiled.txt
veil 요약.md         # 토큰이 든 파일을 주면 알아서 되돌리기 → 요약.unveiled.md
```

- 대응표는 같은 폴더의 `.veil/map.json`에 자동으로 저장되고, 되돌릴 때 알아서 찾아요. 경로를 적을 필요가 없어요.
- `.veil/` 폴더에는 `.gitignore`가 자동으로 생겨서 git에 올라가지 않아요.
- 같은 폴더의 파일은 대응표를 함께 써서, 파일이 달라도 같은 사람은 같은 토큰이에요.

**자주 쓰는 옵션**

```bash
veil 회의록.txt --skip-types AMOUNT      # 금액은 남기기
veil 회의록.txt --allow "법무팀,본사"      # 이 단어는 남기기
veil 회의록.txt --dict 사전.json          # 이 단어는 꼭 가리기
veil detect 회의록.txt                   # 미리보기 (파일을 만들지 않음)
veil check 보낼파일.md                   # 원문이 남았는지 검사 (종료 코드 2 = 남음)
veil help                               # 짧은 사용법 (모든 옵션은 veil help --all)
```

설치하지 않고 이 레포에서 바로 쓰려면 `veil` 대신 `node veil/scripts/veil.mjs`를 쓰면 돼요. NER을 쓰려면 `cd veil/scripts && npm install`을 한 번 실행하세요.

## 자주 묻는 질문

**Claude가 원문을 보게 되나요?**
원문 파일 자체는 보지 않습니다. 스킬은 Claude에게 가린 사본만 읽고 원문·대응표·복원 파일은 열지 말라고 안내합니다. 다만 **탐지가 놓친 값은 가린 사본에 그대로 남아 있어서 Claude가 보게 됩니다.** 이런 값을 발견하면 Claude가 다시 가리고 무엇을 봤는지 알려주지만, 그 시점에는 이미 본 뒤예요. 또 이 안내는 스킬의 규칙이지, 운영체제가 강제하는 보안 경계는 아닙니다.

**탐지는 얼마나 믿을 수 있나요?**
탐지 방식에 따라 다릅니다.

- **형식이 정해진 정보**(이메일·전화·주민번호·여권번호·계좌·카드·IBAN·API 키·접속 주소)는 정규식, 체크섬(Luhn, mod 97), 접두어로 찾아서 가장 안정적입니다. 다만 전각 숫자(`９００１０１…`)처럼 드문 표기는 놓칠 수 있어요.
- **이름·회사**는 단서에 기대는 규칙입니다. 문장에서는 직함·조사·소개 표현(`김철수 팀장`, `저는 김민수이고`)을, 표·CSV·JSON에서는 열 이름과 키(`이름`, `담당자`, `name`, `customer`)를 단서로 씁니다. 단서 없이 나오는 이름(`민수가 그러는데`), 문장 속 로마자 한국 이름(`Kim Minsu sent…`), 처음 보는 회사명은 놓칠 수 있어요.
- 한 번 잡힌 값은 문서 전체에서 다시 찾아 가리고, 가린 뒤에는 유출 검사가 원문 값과 고위험 패턴이 남았는지 확인합니다. 단, 처음부터 못 잡은 값은 유출 검사도 알아내지 못합니다.

**작은 독립 평가셋으로 잰 수치가 있습니다.** 규칙 수정에 쓰지 않은 [`eval/holdout-v1`](eval/holdout-v1)(문서 36건, 개체 129개)에서 규칙만으로 민감정보의 **72.9%**를 가렸습니다(정밀도 92%, lenient 기준). 이메일·카드·주민번호·비밀값·IP처럼 형식이 정해진 정보는 모두 잡았고, 단서 없는 이름이 가장 큰 구멍이었습니다(이름 재현율 55%). 바꿔 말하면 이 평가셋에서는 **민감정보 4개 중 1개 정도가 가려지지 않았습니다.** 평가셋이 작고 같은 저장소에서 AI 도움을 받아 만들었으니 대략적인 지표로만 보세요. 자체 테스트(251개)는 기능이 깨지지 않는지 보는 회귀 테스트이고 정확도 측정이 아닙니다. 중요한 고유명사는 사전에 넣으세요. 사전은 어떤 규칙보다 먼저 적용됩니다. 정말 민감한 문서라면 가린 파일을 한 번 훑어보는 걸 권합니다.

**대응표는 어디에 있나요?**
원본과 같은 폴더의 `.veil/map.json`에 생깁니다. 원문이 들어 있으니 공유하지 마세요. `.veil/` 폴더에는 `.gitignore`가 자동으로 생겨서 git에 올라가지 않아요. 대응표는 본인만 읽을 수 있게(macOS·Linux에서 0600) 저장하고, 임시 파일에 다 쓴 뒤 바꿔치기해서 중간에 끊겨도 깨지지 않습니다. 되돌릴 때는 결과 파일이 있는 폴더부터 위로 찾되 프로젝트 폴더(`.git`이 있는 곳)나 홈 폴더 위로는 올라가지 않고, 상위 폴더의 대응표를 쓰면 어느 대응표를 썼는지 경고합니다.

**`--ner`가 내 글을 어딘가로 보내나요?**
아니요. 모델은 Transformers.js로 내 컴퓨터에서 돕니다. 네트워크는 처음 한 번 Hugging Face에서 모델을 받을 때만 씁니다.

## 테스트

```bash
node veil/scripts/selftest.mjs          # 251개: 4개 언어 탐지, 비밀 정보, 표·데이터, 오탐 방지, 왕복 복원, 명령줄 도구
node veil/scripts/selftest.mjs -q       # 실패한 것만 출력
node veil/scripts/selftest.mjs --ner    # + 실제 NER 모델
node veil/scripts/eval.mjs eval/holdout-v1   # 독립 평가셋으로 정밀도·재현율 측정
```

## 만든 사람

**Veil은 [@min-1225](https://github.com/min-1225)가 만들고 관리합니다** (리드 개발자·메인테이너).

Veil은 TRACEGATE 팀이 코드게이트 2026 AI 스타트업 해커톤에서 만든 개인정보 보호 회의록 에이전트 **VeilNote**에서 출발했습니다 ([팀 원본](https://github.com/TRACEGATE/hackathon_2026), [포트폴리오 미러](https://github.com/min-1225/Hackathon-CodeGate-2026)). 탐지·토큰화 엔진을 그곳에서 가져와 이 스킬에 맞게 확장했습니다.

**VeilNote 원작 팀원 (TRACEGATE):** [@jiyun14](https://github.com/jiyun14) · [@wyr6543](https://github.com/wyr6543) · [@pgr1212](https://github.com/pgr1212)

## 라이선스

[MIT](LICENSE). 상업적 용도를 포함해 자유롭게 쓰고, 고치고, 배포할 수 있습니다.
