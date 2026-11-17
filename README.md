<div align="center">

# 🎭 Veil

**Mask sensitive data before the AI sees it. Unmask it after.**

A Claude Code skill that swaps names, companies, phone numbers, IDs, API keys and more for tokens like `[PERSON_1]`,<br>
lets Claude work on the masked text, then restores the originals on your machine.

[![tests](https://github.com/min-1225/veil-skill/actions/workflows/test.yml/badge.svg)](https://github.com/min-1225/veil-skill/actions/workflows/test.yml)
![runs locally](https://img.shields.io/badge/runs-100%25%20locally-2ea44f)
[![MIT license](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
![Claude Code skill](https://img.shields.io/badge/Claude%20Code-skill-D97757)
![Node 18+](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![zero dependencies](https://img.shields.io/badge/core-zero%20dependencies-blue)
![languages](https://img.shields.io/badge/languages-KO%20%C2%B7%20EN%20%C2%B7%20JA%20%C2%B7%20ZH%20%2B%20NER-8A2BE2)

**English** · [한국어](README.ko.md)

</div>

```diff
- CEO John Smith wants Acme Corp. to pay €250,000 to DE89 3704 0044 0532 0130 00. Call +1 (415) 555-0132.
+ CEO [PERSON_1] wants [ORG_1] to pay [AMOUNT_1] to [ACCOUNT_1]. Call [PHONE_1].

- 김철수 팀장이 ㈜한빛테크에 3억 2천만원을 제안했다. 연락처 010-1234-5678
+ [PERSON_2] 팀장이 ㈜[ORG_2]에 [AMOUNT_2]을 제안했다. 연락처 [PHONE_2]

- OPENAI_API_KEY=sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0f
+ OPENAI_API_KEY=[SECRET_1]
```

## Why

You want AI to summarize the customer call, draft the HR email, clean up the contract notes, review a config file.
You don't want the customer's phone number, the employee's salary, the client's name or your API keys to leave your laptop.

> [!IMPORTANT]
> **Veil runs on your machine.** The skill's job is to run a Node script from the skill folder locally: masking, restoring and the leak check all happen on your computer, with no external server or API in between. Claude only ever receives **the masked copy**; the original file and the token map never leave your machine.

## 10-second start

```bash
npx skills add min-1225/veil-skill
```

Then just ask Claude Code, in any words:

> Summarize `call_notes.txt` for my manager. Don't let the AI see any customer personal info, and give me a version with real names at the end.

Or call it directly with `/veil`.

> [!TIP]
> Give Claude a **file path**, not pasted text. Anything you paste is already in the conversation, so Veil can only mask it for sharing, not hide it from the AI.

## How it works

```mermaid
flowchart LR
    subgraph local["💻 Your machine — Veil runs locally"]
        A[original file] -->|veil| B[masked file]
        A -->|veil| M[(token map)]
        C[result with tokens] -->|unveil| D[result with real values]
        M -.-> D
    end
    B -->|masked text only| CL((Claude))
    CL -->|works with tokens| C
```

1. **Detect** (local): rules, dictionaries and (optionally) a local NER model find sensitive spans.
2. **Veil** (local): each value becomes a stable token. The same person is `[PERSON_1]` everywhere, even across files.
3. **Work**: Claude reads only `*.veiled.*` and keeps tokens intact.
4. **Unveil** (local): tokens are swapped back. Korean particles (이/가, 을/를…) are fixed to match the real word.
5. **Leak check** (local): Veil warns if any original value or high-risk pattern survived.

## What it catches

| Type | Examples |
|---|---|
| `PERSON` | John Smith, Dr. Laura Mendes, 김철수 팀장, 저는 김민수이고, 田中さん, 王伟先生 |
| `ORG` | Acme Corp., Blue Harbor Labs, ㈜한빛테크, 株式会社サンプル, 华为技术有限公司 |
| `EMAIL` · `PHONE` | name@example.com, +1 (415) 555-0132, 010-1234-5678, 090-1234-5678 |
| `SECRET` API keys & secrets | OpenAI `sk-proj-…`, Anthropic `sk-ant-…`, GitHub `ghp_…`, AWS `AKIA…`, Google `AIza…`, Slack/Stripe/Hugging Face keys, JWTs, private keys, `Password: Hunter2!pass`, `postgresql://user:pass@host` (whole URL) |
| `RRN` · `SSN` · `PASSPORT` | 900101-1234567, 123-45-6789, Passport no. X12345678 |
| `CARD` · `ACCOUNT` | 4111 1111 1111 1111 (Luhn-checked), IBAN DE89 3704 … (mod-97-checked), 110-123-456789 |
| `ADDRESS` | 1600 Amphitheatre Parkway, Mountain View, CA 94043 · SW1A 1AA · 경기도 성남시 분당구 판교역로 235 · 〒100-0005 · 北京市朝阳区建国路88号 |
| `AMOUNT` | $50,000, €250,000, ¥3,000,000, 3억 2천만원, 500万元 |
| `EMPLOYEE_ID` | Employee ID: 004512, 사번 EMP-20431 |
| `IP` | 192.168.0.10, 2001:db8::8a2e:370:7334 |
| `LOCATION` | Berlin, Paris (with `--ner`) |
| `DATE` | Nov 17, 2026 · 2026년 3월 5일 (off by default) |

## Choose what to mask

You don't have to mask everything. In Claude Code just say it ("only mask names and IDs", "keep the amounts") and the skill picks the right options.

| You want to | Option | Example |
|---|---|---|
| Mask only certain types | `--types` | `--types PERSON,RRN` → only names and national IDs |
| Keep certain types | `--skip-types` | `--skip-types AMOUNT` → amounts stay as they are |
| Turn on a type that's off by default | `--add-types` | `--add-types DATE` → dates are masked too |
| Keep specific words | `--allow` | `--allow "Acme Corp.,Legal"` (use the exact text that was masked) |
| Mask extra words | `--dict` | `dict.json`: `{"PROJECT":["Bluemoon"]}` |

One sentence with each option applied:

```
original              CEO John Smith (SSN 123-45-6789) offered Acme Corp. $50,000 on Nov 17, 2026. Project Bluemoon. Call +1 (415) 555-0132.
default               CEO [PERSON_1] (SSN [SSN_1]) offered [ORG_1] [AMOUNT_1] on Nov 17, 2026. Project Bluemoon. Call [PHONE_1].
--types PERSON,SSN    CEO [PERSON_1] (SSN [SSN_1]) offered Acme Corp. $50,000 on Nov 17, 2026. Project Bluemoon. Call +1 (415) 555-0132.
--skip-types AMOUNT   CEO [PERSON_1] (SSN [SSN_1]) offered [ORG_1] $50,000 on Nov 17, 2026. Project Bluemoon. Call [PHONE_1].
--add-types DATE      CEO [PERSON_1] (SSN [SSN_1]) offered [ORG_1] [AMOUNT_1] on [DATE_1]. Project Bluemoon. Call [PHONE_1].
--allow "Acme Corp."  CEO [PERSON_1] (SSN [SSN_1]) offered Acme Corp. [AMOUNT_1] on Nov 17, 2026. Project Bluemoon. Call [PHONE_1].
--dict dict.json      CEO [PERSON_1] (SSN [SSN_1]) offered [ORG_1] [AMOUNT_1] on Nov 17, 2026. Project [PROJECT_1]. Call [PHONE_1].
```

- Dictionary type names (`PROJECT`, `PRODUCT`, …) are up to you, and dictionary entries outrank every rule.
- If you deliberately leave high-risk data (phones, national IDs, API keys) unmasked, the leak check warns you. That's expected; keep it if it's intentional.
- Options combine: `--skip-types AMOUNT --allow "Legal" --dict dict.json`

## Languages

| | Rules (no install) | `--ner` (optional local model) |
|---|---|---|
| Korean | ✅ names, companies, addresses, RRN | – |
| English | ✅ titled names, `Attendees:` lists, Inc./Ltd./GmbH, US/UK addresses | ✅ untitled names, unknown companies, places |
| Japanese | ✅ さん/様/部長, 株式会社, 〒 addresses | – |
| Chinese | ✅ 先生/女士/经理, 有限公司, 省市区路号 | ✅ |
| German, French, Spanish, Italian, Portuguese, Dutch, Latvian, Arabic | formats only (email, phone, IBAN, cards…) | ✅ |

```
rules only:  Sarah said Michael talked to Northwind about the Berlin office.
--ner:       [PERSON_1] said [PERSON_2] talked to [ORG_1] about the [LOCATION_1] office.
```

`--ner` uses [`Xenova/bert-base-multilingual-cased-ner-hrl`](https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl) through Transformers.js. It runs on your machine; only the model files (~170 MB) are downloaded once. Rules always win over NER, so NER fills gaps without splitting a longer match (like a full address).

## Features

- 🔒 **Local only.** Masking, the map and restoring all happen on your machine. Command output shows `J*********`, never the value.
- 🔁 **Reversible.** Unlike plain redaction, you get the real values back in the final result.
- 🧩 **Consistent tokens.** Once found, a value is masked everywhere it appears, and a shared map keeps tokens stable across files.
- 🧮 **Checksums.** Card numbers (Luhn) and IBANs (mod 97) cut false positives.
- 🚨 **Leak check.** `check` flags any original value or high-risk pattern left in a file before you send it.
- 🇰🇷 **Korean-aware.** Particle correction on restore, CP949 files, 성씨+직함 name rules.
- 📦 **Zero dependencies** for the core. NER is an opt-in `npm install`.

## Run it locally

Everything the skill does is **run this Node script on your machine**. You can use it straight from a terminal without Claude, and it behaves exactly the same.

```bash
node veil/scripts/veil.mjs detect notes.txt                      # preview (writes nothing)
node veil/scripts/veil.mjs veil notes.txt                        # → notes.veiled.txt + notes.veilmap.json
node veil/scripts/veil.mjs veil notes.txt --ner                  # + local NER model
node veil/scripts/veil.mjs veil a.txt b.txt --map project.veilmap.json   # one map for many files
node veil/scripts/veil.mjs unveil summary.md --map notes.veilmap.json    # restore
node veil/scripts/veil.mjs check outgoing.md --map notes.veilmap.json    # leak check (exit 2 = leak)
node veil/scripts/veil.mjs types                                 # list entity types
```

Options: `--dict dict.json`, `--allow "Sales,HQ"`, `--add-types DATE`, `--skip-types AMOUNT`, `--force`, `--loose`. Run `--help` for all.

To enable NER: `cd veil/scripts && npm install`.

## FAQ

**Does Claude ever see my original text?**
Not if you give it a file path. The skill tells Claude to read only the masked copy and never the original, the map or the restored file. If something slips past detection, Claude re-masks it and tells you what it saw.

**How reliable is detection?**
Structured data is caught with certainty: emails, phones, national IDs, passports and accounts by pattern; card numbers and IBANs verified by checksum (Luhn, mod 97); API keys by their prefixes (`sk-`, `ghp_`, `AKIA`…); connection strings masked whole, credentials included.
Names and companies are found through Korean titles, particles and self-introductions (`김철수 팀장`, `저는 김민수이고`, `담당자는 …`) and English, Japanese and Chinese honorific rules. Once a value is found, Veil searches the whole document again so every later mention is masked too. After masking, the leak check verifies that no original value or high-risk pattern survived.
It's validated on real-world document shapes (meeting notes, support logs, HR memos, English minutes), and 200 tests run in GitHub Actions on every push. For a proper noun that appears with no title or introduction at all, add one line to a dictionary file; dictionary entries outrank every rule.

**Where is the token map?**
Next to your file as `*.veilmap.json`. It contains the originals, so don't share or commit it. This repo's `.gitignore` already excludes it.

**Does `--ner` send my text anywhere?**
No. Transformers.js runs the model locally. The only network access is the one-time model download from Hugging Face.

## Tests

```bash
node veil/scripts/selftest.mjs          # 200 tests: detection in 4 languages, secrets, false positives, round trips, CLI
node veil/scripts/selftest.mjs -q       # print failures only
node veil/scripts/selftest.mjs --ner    # + real NER model
```

## Credits

Veil grew out of **VeilNote**, a privacy-preserving meeting agent built by team TRACEGATE at the CodeGate 2026 AI startup hackathon ([team repo](https://github.com/TRACEGATE/hackathon_2026), [portfolio mirror](https://github.com/min-1225/Hackathon-CodeGate-2026)). The detection and tokenizer engine started there and was extended for this skill.

## License

[MIT](LICENSE). Free to use, modify and share, including commercially.
