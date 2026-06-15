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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from autoskill_agent import skillgen
from skillforge_local.llm import complete_text

# Heuristic ROI assumptions (clearly estimates; tune per customer later).
# Automation does NOT cut spend — it adds AI cost. The win is time + throughput.
RUNS_PER_WEEK = 5  # daily workflows run on business days
SAVE_FACTOR = 0.8  # share of the manual time the skill removes (human still reviews)

# Token-based pricing for the added AI cost (Claude Sonnet 4.6, USD per token).
PRICE_IN_PER_TOKEN = 3.0 / 1_000_000
PRICE_OUT_PER_TOKEN = 15.0 / 1_000_000
# Continuous observation/classification runs on a cheaper model (Haiku 4.5).
OBS_PRICE_IN_PER_TOKEN = 1.0 / 1_000_000
OBS_PRICE_OUT_PER_TOKEN = 5.0 / 1_000_000
OBS_TOKENS_IN = 2500
OBS_TOKENS_OUT = 250

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
    suggested = candidate.get("suggested_skill", {}) if isinstance(candidate.get("suggested_skill"), dict) else {}
    batch = int(evidence.get("daily_batch_size") or 0)
    episodes = int(pattern.get("episode_count") or len(evidence.get("episode_ids") or []) or 0)
    steps = len([a for a in suggested.get("actions", []) if a]) or 6

    minutes_per_run = max(20, round(batch * 0.8)) if batch else 30
    saved_per_run = round(minutes_per_run * SAVE_FACTOR)
    residual = max(1, minutes_per_run - saved_per_run)  # human review/oversight left
    throughput = round(minutes_per_run / residual, 1)
    time_saved_week = saved_per_run * RUNS_PER_WEEK

    # Added AI cost, estimated from the tokens each run sends/receives.
    est_in = 4000 + batch * 400  # context grows with the rows the model reads
    est_out = 800 + steps * 150
    added_per_run = est_in * PRICE_IN_PER_TOKEN + est_out * PRICE_OUT_PER_TOKEN
    added_week = round(added_per_run * RUNS_PER_WEEK, 2)
    return {
        "occurrences_observed": episodes,
        "frequency": "daily (business days)",
        "minutes_per_run": minutes_per_run,
        "runs_per_week": RUNS_PER_WEEK,
        "time_saved_minutes_per_week": time_saved_week,
        "time_saved_hours_per_week": round(time_saved_week / 60, 1),
        "throughput_multiplier": throughput,
        "est_tokens_per_run": est_in + est_out,
        "added_ai_cost_usd_per_week": added_week,
        "added_ai_cost_usd_per_year": round(added_week * 52, 2),
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
    rows.sort(key=lambda r: r["roi"]["time_saved_minutes_per_week"], reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Weekly FDE report
# ---------------------------------------------------------------------------

def usage_trend(root: Path | str, skill_id: str | None = None, *, days: int = 8) -> list[dict[str, Any]]:
    """Daily skill-invocation counts for the last `days` days (oldest first).

    Reads skill_execution events from the event log; returns zeros when there is
    no run history yet."""
    root = _root(root)
    log = root / "workspace" / "events" / "events.jsonl"
    counts: dict[str, int] = {}
    try:
        events = skillgen.read_jsonl(log) if log.exists() else []
    except Exception:
        events = []
    for event in events:
        if not isinstance(event, dict) or event.get("type") != "skill_execution":
            continue
        if skill_id and event.get("skill_id") != skill_id:
            continue
        day = str(event.get("timestamp") or "")[:10]
        if day:
            counts[day] = counts.get(day, 0) + 1
    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        series.append({"label": d.strftime("%m-%d"), "value": counts.get(d.isoformat(), 0)})
    return series


def _observation_cost_week(root: Path) -> float:
    """Estimated weekly AI cost of continuously classifying observed events."""
    per_event = OBS_TOKENS_IN * OBS_PRICE_IN_PER_TOKEN + OBS_TOKENS_OUT * OBS_PRICE_OUT_PER_TOKEN
    weekly_events = max(len(observation_feed(root, limit=10_000)), 1) * 5  # treat feed as ~1 day
    return round(per_event * weekly_events, 2)


def _report_totals(recs: list[dict[str, Any]]) -> dict[str, Any]:
    proposed = [r for r in recs if r["status"] != "accepted"]
    minutes = sum(r["roi"]["time_saved_minutes_per_week"] for r in recs)
    added = round(sum(r["roi"]["added_ai_cost_usd_per_week"] for r in recs), 2)
    throughputs = [r["roi"]["throughput_multiplier"] for r in recs] or [1.0]
    return {
        "workflows_found": len(recs),
        "workflows_proposed": len(proposed),
        "workflows_accepted": len(recs) - len(proposed),
        "time_saved_minutes_per_week": minutes,
        "time_saved_hours_per_week": round(minutes / 60, 1),
        "fte_equivalent": round(minutes / 60 / 40, 2),
        "productivity_multiplier": round(sum(throughputs) / len(throughputs), 1),
        "added_ai_cost_usd_per_week": added,
        "added_ai_cost_usd_per_year": round(added * 52, 2),
    }


def _fallback_summary(totals: dict[str, Any], recs: list[dict[str, Any]]) -> str:
    names = ", ".join(r["title"] for r in recs[:3]) or "no workflows yet"
    return (
        f"This week we found {totals['workflows_found']} repeatable workflow(s) worth automating ({names}). "
        f"Adopting them frees about {totals['time_saved_hours_per_week']} analyst hours/week "
        f"(~{totals['fte_equivalent']} FTE of capacity, ~{totals['productivity_multiplier']}x throughput on those tasks). "
        f"This does not cut spend — it adds an estimated ${totals['added_ai_cost_usd_per_week']:,}/week in AI cost "
        f"(~${totals['added_ai_cost_usd_per_year']:,}/year) — but it converts manual hours into capacity. "
        "Every skill runs under human approval; nothing runs automatically."
    )


def _ai_summary(totals: dict[str, Any], recs: list[dict[str, Any]]) -> str:
    """Have Claude write the executive summary; fall back to a template."""
    try:
        payload = {
            "totals": totals,
            "workflows": [{"title": r["title"], "source_apps": r["source_apps"], "roi": r["roi"]} for r in recs],
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a forward-deployed engineer writing the weekly advisory summary for a finance team. "
                    "Be concrete and non-technical, 2-4 sentences. Lead with the TIME freed (hours/week, FTE "
                    "equivalent, throughput multiplier). Be explicit that this does NOT save money — it ADDS AI "
                    "spend (give the added $/week and $/year). Frame the trade as turning manual hours into "
                    "capacity. Remind them every skill runs under human approval. Do not invent numbers beyond "
                    "the data provided."
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
    obs_cost = _observation_cost_week(root)
    totals["observation_cost_usd_per_week"] = obs_cost
    totals["added_ai_cost_usd_per_week"] = round(totals["added_ai_cost_usd_per_week"] + obs_cost, 2)
    totals["added_ai_cost_usd_per_year"] = round(totals["added_ai_cost_usd_per_week"] * 52, 2)
    summary = _ai_summary(totals, recs) if use_ai else _fallback_summary(totals, recs)
    return {
        "period": "this week",
        "generated_at": skillgen.utc_now(),
        "summary": summary,
        "totals": totals,
        "usage_trend": usage_trend(root),
        "recommendations": recs,
    }


# ---------------------------------------------------------------------------
# Org-level workflows (the FDE deployment layer, above individual skills)
# ---------------------------------------------------------------------------

WORKFLOW_TEMPLATES: dict[str, dict[str, Any]] = {
    "daily_cash_reconciliation": {
        "name": "Daily Financial Close",
        "description": "An AI-assisted daily close: reconcile bank activity, triage exceptions, and draft the close summary — orchestrated end to end with human sign-off.",
        "composed_of": ["Daily cash reconciliation", "Exception triage", "Close summary reporting"],
        "people_involved": 3,
        "priority": "high",
        "fde_recommendation": "Deploy this as the team's standing daily-close workflow. It removes the most repetitive analyst time, scales with transaction volume, and keeps every write behind reviewer approval.",
    },
    "fde_intake_candidate": {
        "name": "Customer Onboarding Pipeline",
        "description": "Capture inbound onboarding requests, extract customer and blockers, update the tracker, and draft the next-step reply — one consistent intake path.",
        "composed_of": ["Onboarding intake", "Tracker update", "Follow-up drafting"],
        "people_involved": 2,
        "priority": "medium",
        "fde_recommendation": "Stand this up to give onboarding a single source of truth and cut intake latency. Highest value once volume exceeds a few requests per week.",
    },
}


def workflows(root: Path | str) -> list[dict[str, Any]]:
    """Org-level workflow recommendations: what an FDE would deploy to lift team efficiency."""
    root = _root(root)
    recs = {r["workflow_family"]: r for r in recommendations(root)}
    out = []
    for family, tmpl in WORKFLOW_TEMPLATES.items():
        rec = recs.get(family)
        roi = rec["roi"] if rec else {}
        people = int(tmpl["people_involved"])
        team_hours = round(float(roi.get("time_saved_hours_per_week", 0)) * people, 1)
        added_week = round(float(roi.get("added_ai_cost_usd_per_week", 0)) * people, 2)
        out.append(
            {
                "id": family,
                "name": tmpl["name"],
                "description": tmpl["description"],
                "composed_of": tmpl["composed_of"],
                "source_apps": rec["source_apps"] if rec else ["excel", "gmail"],
                "status": "recommended",
                "priority": tmpl["priority"],
                "fde_recommendation": tmpl["fde_recommendation"],
                "impact": {
                    "people_involved": people,
                    "runs_per_week": int(roi.get("runs_per_week", 5)) * people,
                    "team_hours_saved_per_week": team_hours,
                    "fte_equivalent": round(team_hours / 40, 2),
                    "productivity_multiplier": float(roi.get("throughput_multiplier", 2.0)),
                    "added_ai_cost_usd_per_week": added_week,
                    "added_ai_cost_usd_per_year": round(added_week * 52, 2),
                },
            }
        )
    out.sort(key=lambda w: w["impact"]["team_hours_saved_per_week"], reverse=True)
    return out


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


# ---------------------------------------------------------------------------
# Skills inventory (for the Skills panel + per-skill diagram)
# ---------------------------------------------------------------------------

def _skill_graph(skill: dict[str, Any]) -> dict[str, Any]:
    workflow = skill.get("workflow", {}) if isinstance(skill.get("workflow"), dict) else {}
    raw_steps = [s for s in workflow.get("steps", []) if isinstance(s, dict)]
    steps = []
    for s in sorted(raw_steps, key=lambda s: s.get("order", 0)):
        steps.append(
            {
                "order": int(s.get("order") or len(steps) + 1),
                "id": s.get("id") or "",
                "title": s.get("title") or str(s.get("id") or "Step").replace("_", " ").title(),
                "type": s.get("type") or "",
                "summary": s.get("summary") or "",
            }
        )
    triggers = skill.get("triggers", [])
    trigger_label = ""
    if triggers and isinstance(triggers[0], dict):
        trigger_label = triggers[0].get("label") or triggers[0].get("event_type") or ""
    expected = workflow.get("expected_outcome", {}) if isinstance(workflow.get("expected_outcome"), dict) else {}
    return {
        "trigger": trigger_label or "New matching event",
        "steps": steps,
        "outcome": expected.get("summary") or "",
    }


def _skill_apps(skill: dict[str, Any]) -> list[str]:
    apps: set[str] = set()
    resources = skill.get("resources", {}) if isinstance(skill.get("resources"), dict) else {}
    items = (resources.get("inputs", []) or []) + (resources.get("outputs", []) or [])
    for io in items:
        kind = str(io.get("type", "")).lower() if isinstance(io, dict) else ""
        if "xlsx" in kind or "workbook" in kind or "sheet" in kind:
            apps.add("excel")
        if "email" in kind or "draft" in kind:
            apps.add("gmail")
    return sorted(apps) or ["excel"]


def _skill_summary(skill: dict[str, Any], *, installed_locally: bool, local_path: str, usage: dict[str, Any]) -> dict[str, Any]:
    skill_id = skill.get("skill_id", "")
    workflow = skill.get("workflow", {}) if isinstance(skill.get("workflow"), dict) else {}
    steps = workflow.get("steps", []) if isinstance(workflow.get("steps"), list) else []
    return {
        "skill_id": skill_id,
        "name": skill.get("name") or skill_id.replace("_", " ").title(),
        "description": skill.get("description") or "",
        "status": skill.get("status") or "active",
        "source_workflow": (skill.get("source_candidate") or {}).get("candidate_id") or skill_id,
        "step_count": len(steps),
        "source_apps": _skill_apps(skill),
        "guardrails": [str(g) for g in skill.get("guardrails", []) if g],
        "installed_locally": installed_locally,
        "local_path": local_path,
        "invocations": int(usage.get("runs", 0) or 0),
        "matches": int(usage.get("matches", 0) or 0),
        "graph": _skill_graph(skill),
    }


def skills_inventory(root: Path | str) -> list[dict[str, Any]]:
    """List generated/installed skills with per-skill workflow graphs."""
    root = _root(root)
    usage_by_id: dict[str, dict[str, Any]] = {}
    try:
        for item in skillgen.skillops_summary(root).get("skills", []):
            usage_by_id[item.get("skill_id")] = {"runs": item.get("runs", 0), "matches": item.get("matches", 0)}
    except Exception:
        pass

    out: dict[str, dict[str, Any]] = {}

    def ingest(base: Path, installed_locally: bool) -> None:
        if not base.exists():
            return
        for d in sorted(base.iterdir()):
            skill_json = d / "skill.json"
            if not (d.is_dir() and skill_json.exists()):
                continue
            try:
                skill = json.loads(skill_json.read_text(encoding="utf-8"))
            except Exception:
                continue
            skill_id = skill.get("skill_id", "")
            if skill_id in out:
                continue
            summary = _skill_summary(
                skill,
                installed_locally=installed_locally,
                local_path=str(d) if installed_locally else "",
                usage=usage_by_id.get(skill_id, {}),
            )
            summary["trend"] = usage_trend(root, skill_id)
            out[skill_id] = summary

    ingest(local_skills_dir(), installed_locally=True)
    ingest(root / "workspace" / "skills", installed_locally=False)
    return list(out.values())
