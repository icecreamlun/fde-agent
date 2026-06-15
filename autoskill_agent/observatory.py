"""Observe -> recommend product surface (Phase 1).

This module powers the "AI FDE" experience: it watches connected event sources
(Gmail, Excel), surfaces the observed activity, mines repeated workflows into
recommendations with ROI estimates, produces a weekly FDE-style report, and —
only when the user accepts — generates a detailed skill bundle and installs it
into the user's *local* skills directory (~/.claude/skills).

There is deliberately no "run the workflow" capability here. We give advice and
a ready-to-run skill.md; the human decides what to do with it.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from autoskill_agent import skillgen
from skillforge_local.llm import complete_text

# Heuristic ROI assumptions (clearly estimates; tune per customer later).
RUNS_PER_WEEK = 5  # daily workflows run on business days
SAVE_FACTOR = 0.8  # automation handles most of the work; humans still review
HOURLY_RATE_USD = 75.0  # loaded cost of a finance analyst hour
MODEL_COST_PER_RUN_USD = 0.06  # rough Sonnet cost per run

# Which connected sources we present in onboarding.
SOURCE_DEFS = [
    {"id": "gmail", "name": "Gmail", "kind": "email", "description": "Inbound and outbound email activity."},
    {"id": "excel", "name": "Excel", "kind": "spreadsheet", "description": "Workbook and cell-level changes."},
]

_EVENT_SOURCE = {
    "email_received": "gmail",
    "outbound_message_created": "gmail",
    "email_sent": "gmail",
    "spreadsheet_row_updated": "excel",
    "workbook_updated": "excel",
}


def _root(root: Path | str) -> Path:
    return Path(root)


# ---------------------------------------------------------------------------
# Observation feed
# ---------------------------------------------------------------------------

def _activity_sources(root: Path) -> list[Path]:
    """Files that hold normalized activity events, newest signal first."""
    candidates = [
        root / "workspace" / "events" / "activity_events.jsonl",
        root / "tests" / "fixtures" / "cash_recon_events.jsonl",
        root / "tests" / "fixtures" / "fde_intake_events.jsonl",
    ]
    return [path for path in candidates if path.exists()]


def _event_source(event: dict[str, Any]) -> str:
    return _EVENT_SOURCE.get(str(event.get("type")), "system")


def _event_summary(event: dict[str, Any]) -> str:
    payload = event.get("payload", {}) if isinstance(event.get("payload"), dict) else {}
    etype = str(event.get("type"))
    if etype in ("email_received",):
        sender = payload.get("from") or payload.get("sender") or "a sender"
        subject = payload.get("subject") or "(no subject)"
        return f"Email from {sender}: {subject}"
    if etype in ("outbound_message_created", "email_sent"):
        subject = payload.get("subject") or payload.get("to") or "a reply"
        return f"Drafted reply: {subject}"
    if etype in ("spreadsheet_row_updated", "workbook_updated"):
        workbook = Path(str(payload.get("workbook") or "workbook")).name
        sheet = payload.get("sheet") or "sheet"
        row = payload.get("row_number") or payload.get("target_rows") or ""
        suffix = f" row {row}" if row else ""
        return f"{workbook} · {sheet}{suffix} updated"
    return f"{etype.replace('_', ' ')} event"


def observation_feed(root: Path | str, limit: int = 25) -> list[dict[str, Any]]:
    root = _root(root)
    rows: list[dict[str, Any]] = []
    for path in _activity_sources(root):
        try:
            events = skillgen.read_jsonl(path)
        except Exception:
            continue
        for event in events:
            if not isinstance(event, dict):
                continue
            rows.append(
                {
                    "id": event.get("event_id") or event.get("id") or "",
                    "ts": event.get("ts") or event.get("timestamp") or "",
                    "source": _event_source(event),
                    "type": event.get("type"),
                    "actor": event.get("actor") or "",
                    "summary": _event_summary(event),
                }
            )
    rows.sort(key=lambda r: str(r.get("ts")), reverse=True)
    return rows[:limit]


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------

def _accepted_ids(root: Path) -> set[str]:
    state = root / "workspace" / "accepted.json"
    if not state.exists():
        return set()
    try:
        data = json.loads(state.read_text(encoding="utf-8"))
        return set(data.get("accepted", []))
    except Exception:
        return set()


def _mark_accepted(root: Path, candidate_id: str) -> None:
    accepted = _accepted_ids(root)
    accepted.add(candidate_id)
    state = root / "workspace" / "accepted.json"
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(json.dumps({"accepted": sorted(accepted)}, indent=2) + "\n", encoding="utf-8")


def connection_status(root: Path | str) -> list[dict[str, Any]]:
    root = _root(root)
    feed = observation_feed(root, limit=10_000)
    by_source: dict[str, dict[str, Any]] = {}
    for row in feed:
        bucket = by_source.setdefault(row["source"], {"count": 0, "last_ts": ""})
        bucket["count"] += 1
        if str(row["ts"]) > str(bucket["last_ts"]):
            bucket["last_ts"] = row["ts"]
    out = []
    for src in SOURCE_DEFS:
        stats = by_source.get(src["id"], {"count": 0, "last_ts": ""})
        out.append(
            {
                **src,
                "status": "connected",
                "event_count": stats["count"],
                "last_event_at": stats["last_ts"],
            }
        )
    return out


# ---------------------------------------------------------------------------
# Recommendations + ROI
# ---------------------------------------------------------------------------

def _candidate_rows(root: Path) -> list[dict[str, Any]]:
    jsonl_path = root / "workspace" / "events" / "skill_candidates.jsonl"
    try:
        return skillgen.read_jsonl(jsonl_path)
    except Exception:
        return []


def _source_apps(candidate: dict[str, Any]) -> list[str]:
    pattern = candidate.get("pattern", {}) if isinstance(candidate.get("pattern"), dict) else {}
    sequence = pattern.get("common_sequence") or []
    apps: list[str] = []
    for step in sequence:
        source = _EVENT_SOURCE.get(str(step))
        if source and source not in apps:
            apps.append(source)
    return apps or ["gmail", "excel"]


def _roi(candidate: dict[str, Any]) -> dict[str, Any]:
    evidence = candidate.get("evidence", {}) if isinstance(candidate.get("evidence"), dict) else {}
    pattern = candidate.get("pattern", {}) if isinstance(candidate.get("pattern"), dict) else {}
    batch = int(evidence.get("daily_batch_size") or 0)
    episodes = int(pattern.get("episode_count") or len(evidence.get("episode_ids") or []) or 0)
    minutes_per_run = max(20, round(batch * 0.8)) if batch else 30
    time_saved_week = round(minutes_per_run * RUNS_PER_WEEK * SAVE_FACTOR)
    cost_saved_week = round(time_saved_week / 60 * HOURLY_RATE_USD, 2)
    model_cost_week = round(MODEL_COST_PER_RUN_USD * RUNS_PER_WEEK, 2)
    return {
        "occurrences_observed": episodes,
        "frequency": "daily (business days)",
        "minutes_per_run": minutes_per_run,
        "runs_per_week": RUNS_PER_WEEK,
        "time_saved_minutes_per_week": time_saved_week,
        "cost_saved_usd_per_week": cost_saved_week,
        "cost_saved_usd_per_year": round(cost_saved_week * 52, 2),
        "model_cost_usd_per_week": model_cost_week,
    }


def _recommendation(root: Path, candidate: dict[str, Any], accepted: set[str]) -> dict[str, Any]:
    suggested = candidate.get("suggested_skill", {}) if isinstance(candidate.get("suggested_skill"), dict) else {}
    evidence = candidate.get("evidence", {}) if isinstance(candidate.get("evidence"), dict) else {}
    pattern = candidate.get("pattern", {}) if isinstance(candidate.get("pattern"), dict) else {}
    candidate_id = candidate.get("candidate_id", "")
    return {
        "id": candidate_id,
        "title": candidate.get("name_suggestion") or pattern.get("workflow_family") or "Detected workflow",
        "workflow_family": pattern.get("workflow_family") or "",
        "confidence": float(candidate.get("confidence") or 0),
        "source_apps": _source_apps(candidate),
        "trigger": suggested.get("trigger") or "",
        "actions": [str(a) for a in suggested.get("actions", []) if a],
        "forbidden_actions": [str(a) for a in suggested.get("forbidden_actions", []) if a],
        "target_artifact": Path(str(evidence.get("target_artifact") or "")).name,
        "target_sheet": evidence.get("target_sheet") or "",
        "common_fields": [str(f) for f in evidence.get("common_fields", []) if f],
        "status": "accepted" if candidate_id in accepted else "proposed",
        "roi": _roi(candidate),
    }


def recommendations(root: Path | str) -> list[dict[str, Any]]:
    root = _root(root)
    accepted = _accepted_ids(root)
    rows = [_recommendation(root, candidate, accepted) for candidate in _candidate_rows(root) if isinstance(candidate, dict)]
    rows.sort(key=lambda r: r["roi"]["cost_saved_usd_per_week"], reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Weekly FDE report
# ---------------------------------------------------------------------------

def _report_totals(recs: list[dict[str, Any]]) -> dict[str, Any]:
    proposed = [r for r in recs if r["status"] != "accepted"]
    return {
        "workflows_found": len(recs),
        "workflows_proposed": len(proposed),
        "workflows_accepted": len(recs) - len(proposed),
        "time_saved_minutes_per_week": sum(r["roi"]["time_saved_minutes_per_week"] for r in recs),
        "cost_saved_usd_per_week": round(sum(r["roi"]["cost_saved_usd_per_week"] for r in recs), 2),
        "cost_saved_usd_per_year": round(sum(r["roi"]["cost_saved_usd_per_year"] for r in recs), 2),
        "model_cost_usd_per_week": round(sum(r["roi"]["model_cost_usd_per_week"] for r in recs), 2),
    }


def _fallback_summary(totals: dict[str, Any], recs: list[dict[str, Any]]) -> str:
    hours = round(totals["time_saved_minutes_per_week"] / 60, 1)
    names = ", ".join(r["title"] for r in recs[:3]) or "no workflows yet"
    return (
        f"This week we observed {totals['workflows_found']} repeatable workflow(s) worth automating "
        f"({names}). Adopting them would save about {hours} analyst hours/week "
        f"(~${totals['cost_saved_usd_per_week']:,}/week, ~${totals['cost_saved_usd_per_year']:,}/year) "
        f"at an estimated model cost of ${totals['model_cost_usd_per_week']:,}/week. "
        "Each ships as a reviewable skill that runs under human approval — no automatic actions."
    )


def _ai_summary(totals: dict[str, Any], recs: list[dict[str, Any]]) -> str:
    """Have Claude write the executive summary; fall back to a template."""
    try:
        payload = {
            "totals": totals,
            "workflows": [
                {"title": r["title"], "source_apps": r["source_apps"], "roi": r["roi"]}
                for r in recs
            ],
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a forward-deployed engineer writing the weekly advisory summary for a "
                    "finance team. Be concrete and non-technical. 2-4 sentences. Lead with the dollar/time "
                    "impact, name the top workflows, and remind them every skill runs under human approval. "
                    "Do not invent numbers beyond the data provided."
                ),
            },
            {"role": "user", "content": json.dumps(payload, sort_keys=True)},
        ]
        return complete_text(messages, max_tokens=500, timeout_seconds=60).strip()
    except Exception:
        return _fallback_summary(totals, recs)


def weekly_report(root: Path | str, *, use_ai: bool = True) -> dict[str, Any]:
    root = _root(root)
    recs = recommendations(root)
    totals = _report_totals(recs)
    summary = _ai_summary(totals, recs) if use_ai else _fallback_summary(totals, recs)
    return {
        "period": "this week",
        "generated_at": skillgen.utc_now(),
        "summary": summary,
        "totals": totals,
        "recommendations": recs,
    }


# ---------------------------------------------------------------------------
# Accept -> generate skill -> install locally
# ---------------------------------------------------------------------------

def local_skills_dir() -> Path:
    """The user's local skills directory. Defaults to ~/.claude/skills; override
    with SKILLFORGE_LOCAL_SKILLS_DIR."""
    override = os.environ.get("SKILLFORGE_LOCAL_SKILLS_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".claude" / "skills"


def accept_recommendation(root: Path | str, candidate_id: str, *, planner: str = "anthropic") -> dict[str, Any]:
    """Generate the skill bundle for a recommendation and install it locally."""
    root = _root(root)
    review = skillgen.create_review_session(root, candidate_id, planner=planner)
    if review.get("status") not in (None, "awaiting_human_review", "installed") and "review_session_id" not in review:
        # validation error shape
        return {"status": "error", "candidate_id": candidate_id, "detail": review}
    install = skillgen.install_skill(root, review["review_session_id"])
    if install.get("status") != "installed":
        return {"status": "error", "candidate_id": candidate_id, "detail": install}

    skill_id = install["skill_id"]
    bundle_dir = Path(install["skill_dir"])
    slug = skillgen.kebab(skill_id)
    local_dir = local_skills_dir() / slug
    local_dir.mkdir(parents=True, exist_ok=True)
    installed_files: list[str] = []
    for name in ("SKILL.md", "skill.json", "skill.yaml", "policy.yaml"):
        src = bundle_dir / name
        if src.exists():
            shutil.copy2(src, local_dir / name)
            installed_files.append(name)

    _mark_accepted(root, candidate_id)

    skill_md = bundle_dir / "SKILL.md"
    preview = skill_md.read_text(encoding="utf-8")[:1200] if skill_md.exists() else ""
    return {
        "status": "installed",
        "candidate_id": candidate_id,
        "skill_id": skill_id,
        "bundle_dir": str(bundle_dir),
        "local_path": str(local_dir),
        "installed_files": installed_files,
        "skill_md_preview": preview,
        "planner": (review.get("planner") or {}).get("mode", planner),
    }
