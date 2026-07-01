<!-- DOC-META
owner: 인프라팀
reviewed: 2026-07-01
review_every_days: 60
status: active
sot: agent-survey 내부 관리체계 개요와 문서 지도(진입점)
-->

# agent-survey (AgentMind) 내부 관리체계 (Operating System)

> **이 문서가 진입점이다.** 우리가 어떻게 일하고, 지식을 어떻게 보존·최신유지하는지의 한 장.
> 상세 원리는 전역 `~/CLAUDE.md` "📚 지식·문서 관리" 및 `~/wiki/concepts/knowledge-ops-system.md` 참조.

---

## 1. 5대 원칙 (요지)
1. **단일 진실원천** — 한 주제는 한 문서만 authoritative(`sot:`). 같은 사실 중복 금지(드리프트 원인).
2. **담당 + 검토기한** — 모든 관리 문서에 `owner`와 `review_every_days`. 주인 없는·낡은 지식 금지.
3. **자동 집행** — 사람이 일일이 안 봐도 `docs/ops/doc_health.py`가 신선도·담당을 점검.
4. **결정·근거 보존** — "무엇을"이 아니라 **"왜 그렇게 정했나"**를 `DECISIONS.md`에 남긴다.
5. **저마찰 + AI친화** — 운영자(비개발자)도 말로 기여, AI도 읽기 쉽게.

## 2. 문서 지도 (무엇을 어디서 — 단일출처)
| 주제 | 단일출처 문서 | 담당 |
|---|---|---|
| 프로젝트 개요·실행법 | `README.md` | 플랫폼팀 |
| API 명세 | `docs/api-spec.md` | 플랫폼팀 |
| 사업계획 | `docs/business-plan.md` | 플랫폼팀 |
| 내부 관리체계(진입점) | `docs/ops/OPERATING_SYSTEM.md` | 인프라팀 |
| 문서 작성·관리 규칙 | `docs/ops/DOC_STANDARD.md` | 인프라팀 |
| 팀 편성·담당 | `docs/ops/TEAM.md` | 인프라팀 |
| 보고 체계(팀별+chief) | `docs/ops/REPORTING.md` | 인프라팀 |
| 주요 의사결정 근거 | `docs/ops/DECISIONS.md` | 인프라팀 |

## 3. 팀 (기능별 3팀 — `docs/ops/TEAM.md`)
**플랫폼팀 · 연동팀 · 인프라팀.** 보고는 팀 이름으로. 운영자가 방향·우선순위를 결정한다.

## 4. 운영 리듬
- **매 결정**: 근거를 `DECISIONS.md`에 D### 한 건.
- **매 문서 수정**: DOC-META `reviewed:`를 그날로 갱신.
- **정기 점검**: `python3 docs/ops/doc_health.py` → 담당 누락·검토기한 초과 문서 조치.
- **마무리**: 문서·코드는 원자 커밋, 리모트 동기화.

## 5. 다음 단계 (이 체계의 정착)
- 핵심 문서(README·docs/*)에 **DOC-META 점진 적용**(각 담당 팀이 다음 수정 시).
- `doc_health.py`를 정기 실행(수동 → 이후 훅/CI 검토).
