"""문서 건강도 점검 — DOC-META 자동 집행 (지식·문서 운영 체계, 범용판).

전역 기본 동작(~/CLAUDE.md "지식·문서 관리")의 프로젝트 집행 도구. 프로젝트의 관리 문서
머리에 있는 DOC-META 블록을 읽어 **담당 누락·검토기한 초과·상태**를 자동 플래그한다.
자동 발견: 프로젝트 루트의 *.md + docs/ 하위 *.md (node_modules·.git·.venv 등 제외).

DOC-META 형식:
    <!-- DOC-META
    owner: <담당 팀/사람>
    reviewed: 2026-07-01
    review_every_days: 30
    status: active | deprecated | archived
    sot: <이 문서가 유일한 진실원천인 주제>
    -->

사용:  python3 tools/ops/doc_health.py            # 점검
       python3 tools/ops/doc_health.py --strict   # 문제 있으면 RC≠0 (훅/CI)
"""
import os
import re
import sys
import glob
import subprocess
import datetime

_META_RE = re.compile(r"<!--\s*DOC-META\s*(.*?)-->", re.S)
_SKIP = ("/node_modules/", "/.git/", "/.venv/", "/vendor/", "/dist/", "/build/",
         "/.obsidian/", "/__pycache__/")


def _root():
    try:
        return subprocess.check_output(["git", "rev-parse", "--show-toplevel"],
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return os.getcwd()


def _managed_docs(root):
    files = set(glob.glob(os.path.join(root, "*.md")))
    files |= set(glob.glob(os.path.join(root, "docs", "**", "*.md"), recursive=True))
    return sorted(f for f in files if not any(s in f.replace("\\", "/") for s in _SKIP))


def _parse_meta(path):
    try:
        with open(path, encoding="utf-8") as f:
            head = f.read(4000)
    except Exception:
        return None
    m = _META_RE.search(head)
    if not m:
        return None
    meta = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.split("#", 1)[0].strip()
    return meta


def _check(path, root, today):
    rel = os.path.relpath(path, root)
    meta = _parse_meta(path)
    if meta is None:
        return ("NO-META", rel, "DOC-META 없음 — 담당/검토기한 미지정")
    owner = meta.get("owner", "")
    status = meta.get("status", "active")
    if status in ("deprecated", "archived"):
        return ("ARCHIVED", rel, f"{status} (owner={owner or '—'})")
    if not owner:
        return ("NO-OWNER", rel, "owner 누락")
    try:
        days = (today - datetime.date.fromisoformat(meta.get("reviewed", ""))).days
        limit = int(meta.get("review_every_days", ""))
        if days > limit:
            return ("OVERDUE", rel, f"{days}일 경과 > {limit}일 (owner={owner}, 최종 {meta.get('reviewed')})")
        return ("OK", rel, f"{days}/{limit}일 (owner={owner})")
    except Exception:
        return ("BAD-META", rel, f"reviewed/review_every_days 형식오류")


def main(strict=False):
    root, today = _root(), datetime.date.today()
    rows = [_check(p, root, today) for p in _managed_docs(root)]
    order = {"OVERDUE": 0, "NO-META": 1, "NO-OWNER": 2, "BAD-META": 3, "ARCHIVED": 4, "OK": 5}
    rows.sort(key=lambda r: order.get(r[0], 9))
    icon = {"OK": "✅", "OVERDUE": "⏰", "NO-META": "❓", "NO-OWNER": "👤",
            "BAD-META": "⚠️", "ARCHIVED": "📦"}
    print(f"=== 문서 건강도 (DOC-META) · {os.path.basename(root)} ===")
    for state, rel, note in rows:
        print(f"  {icon.get(state, '•')} [{state:9s}] {rel:46s} {note}")
    bad = [r for r in rows if r[0] in ("OVERDUE", "NO-META", "NO-OWNER", "BAD-META")]
    print(f"\n총 {len(rows)}개 / 조치필요 {len(bad)}개")
    if strict and bad:
        sys.exit(1)


if __name__ == "__main__":
    main(strict="--strict" in sys.argv)
