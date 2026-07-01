<!-- DOC-META
owner: 인프라팀
reviewed: 2026-07-01
review_every_days: 60
status: active
sot: 문서 작성·관리 표준(메타데이터 + 글쓰기 규칙)
-->

# 문서 표준 (Doc Standard)

> 목적: 문서가 **저절로 최신·단일출처·누구나 읽기 쉽게** 유지되게 한다.
> 근거: 전역 `~/CLAUDE.md` "지식·문서 관리" + `~/wiki/concepts/knowledge-ops-system.md`.

---

## 1. 모든 관리 문서는 머리에 **DOC-META**를 단다 (담당 + 검토기한)
문서 맨 위 HTML 주석 블록:

```
<!-- DOC-META
owner: <담당 팀>            # 플랫폼팀 / 연동팀 / 인프라팀 (docs/ops/TEAM.md)
reviewed: 2026-07-01        # 마지막으로 사람이 최신 확인한 날 (YYYY-MM-DD)
review_every_days: 60       # 이 주기 지나면 '검토 필요'로 자동 플래그
status: active              # active / deprecated / archived
sot: <이 문서가 유일한 진실원천인 주제>   # 없으면 생략
-->
```

- `docs/ops/doc_health.py`가 이 블록을 읽어 **담당 누락·검토기한 초과·상태**를 자동 점검한다.
- 문서를 실질적으로 손대면 `reviewed:`를 그날로 갱신한다.

## 2. 단일 진실원천 (Single Source of Truth)
- 한 주제는 **한 문서**만 authoritative. `sot:`로 명시. 같은 사실을 두 곳에 쓰지 않는다(드리프트 원인).
- 어디가 무엇의 출처인지는 `docs/ops/OPERATING_SYSTEM.md`의 "문서 지도"가 관장.
- 낡아서 틀린 문서는 **삭제 대신 `status: deprecated` + 상단 배너**로 현행 출처를 가리킨다.

## 3. 글쓰기 규칙 (저마찰 · 비개발자 · AI 친화)
운영자는 **비개발자**이고, 이 문서들은 **AI 에이전트도 읽는다**. 둘 다 만족:
1. **쉬운 말** — 코더 용어(함수명·RC·dict) 노출 최소화, 필요하면 비유.
2. **결론 먼저** — 문서/섹션 첫 줄에 핵심 한 줄. 서사는 뒤.
3. **구조를 명확히** — 표·목록·짧은 단락. AI가 검색·인용하기 좋게 제목을 의미있게.
4. **근거·출처 링크** — 주장 옆에 파일:라인 또는 로그 근거. "추정"은 추정이라 표기.
5. **저마찰** — 운영자는 git/마크다운 몰라도 말로 주면 담당 팀이 문서에 반영.

## 4. 하지 말 것 (trash knowledge 방지)
- 담당·검토기한 없는 문서(주인 없는 지식). → DOC-META 필수.
- 한 번 쓰고 방치돼 낡는 문서. → 검토주기로 자동 플래그.
- 같은 사실이 여러 곳에 흩어짐. → 단일출처 강제.
