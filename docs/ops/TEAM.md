<!-- DOC-META
owner: 인프라팀
reviewed: 2026-07-01
review_every_days: 90
status: active
sot: 기능별 팀 편성과 담당 범위
-->

# 팀 헌장 (Team Charter)

> agent-survey(AgentMind)를 **기능별 3개 팀**으로 나눠 운영한다. 팀장 에이전트가 총괄하고, 각 팀은
> 필요 시 탐색/구현/검토 인력을 붙여 가동한다. **보고는 팀 이름으로** 한다. 운영자는 방향·우선순위를 결정한다.

---

## 기능별 팀
| 팀 | 담당 기능 | 주요 자산 |
|---|---|---|
| **플랫폼팀** | 백엔드 API·설문 배송·응답 스코어링·DB·리워드 계산 | `packages/backend`(Express+TS, raw `pg`), `docs/api-spec.md` |
| **연동팀** | Respondent SDK·온체인 리워드(EIP-712/USDC on Base) 연동 | `packages/sdk/respondent`, `ethers` v6 |
| **인프라팀** | 배포(Railway/Neon)·git 위생·환경·문서·관리체계 | `.env`·마이그레이션, `docs/ops/*`, doc_health |

## 운영 규칙
- 각 팀 문서·코드에는 **DOC-META `owner`**로 팀을 명시(`docs/ops/DOC_STANDARD.md`).
- **보고(2단, `docs/ops/REPORTING.md`)**: 각 팀은 `0_report/teams/YYYY-MM-DD_<팀>.md`에 자기 진행을 올리고
  서로 읽어 협업한다. 팀장은 이를 종합해 운영자용 `0_report/report_chief/YYYY-MM-DD.md`를 쓴다.
- 팀 구성 변경은 운영자 승인 사항 — `~/.claude/agents/team/pending-changes.md`에 기록 후 결재.
