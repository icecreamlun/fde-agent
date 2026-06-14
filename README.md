# Dell/NVIDIA Local Agent Wiring

This workspace wires the downloaded local stack to the existing Qwen GGUF model:

- Model: `D:\models\qwen3-30b\Qwen3-30B-A3B-Q4_K_M.gguf`
- OpenClaw source: `D:\models\openclaw`
- NemoClaw source: `D:\models\NemoClaw`
- OpenShell source: `D:\models\OpenShell`

The downloaded stack repos are treated as read-only inputs. Runtime state, configs, and demo workspace files live under `D:\hackathon`.

## Fast Path

From PowerShell:

```powershell
cd D:\hackathon
.\scripts\wire-stack.ps1
```

If Ollama is installed, import and start the existing Qwen model:

```powershell
.\scripts\wire-stack.ps1 -StartModel
```

Then validate OpenClaw against the isolated config:

```powershell
.\scripts\wire-stack.ps1 -RunOpenClawCheck
```

When `nemoclaw` and `openshell` are installed on PATH, create the NemoClaw/OpenShell sandbox:

```powershell
.\scripts\wire-stack.ps1 -RunNemoClawOnboard
```

## What Is Wired

OpenClaw uses `config/openclaw.json` with:

- Primary model: `ollama/qwen3-30b-a3b-local`
- Ollama endpoint: `http://127.0.0.1:11434`
- Workspace: `D:\hackathon\workspace`
- Isolated runtime home: `D:\hackathon\.runtime\openclaw-home`
- Isolated runtime state: `D:\hackathon\.runtime\openclaw-state`

The setup scripts also validate these downloaded source trees:

- `OPENCLAW_SOURCE_DIR=D:\models\openclaw`
- `NEMOCLAW_SOURCE_DIR=D:\models\NemoClaw`
- `OPENSHELL_SOURCE_DIR=D:\models\OpenShell`

Ollama imports the existing GGUF through a generated Modelfile under `.runtime`.

NemoClaw uses:

- `NEMOCLAW_PROVIDER=ollama`
- `NEMOCLAW_MODEL=qwen3-30b-a3b-local`
- `NEMOCLAW_SANDBOX_NAME=vendor-risk-agent`

OpenShell route examples are in `config/openshell-routes.yaml` for standalone inference routing.

## Current Host Notes

This Windows host currently has OpenClaw and Docker on PATH, but not Ollama, NemoClaw, OpenShell, or llama.cpp. The scripts detect that and stop before host-level installation.

The downloaded NemoClaw/OpenClaw source trees do not contain `dist/` or `node_modules`, so using them directly requires a build/install step. The wiring here points to the existing model and configures the runtime surfaces that are available without modifying `D:\models`.

## SkillForge Local: Skill Generation

The Team B skill-generation flow from the final design doc is implemented under `autoskill_agent/skillgen.py`.

## Live Email To Excel Intake

Configure Gmail or any IMAP-compatible inbox:

```powershell
$env:SKILLFORGE_IMAP_HOST="imap.gmail.com"
$env:SKILLFORGE_IMAP_PORT="993"
$env:SKILLFORGE_IMAP_USERNAME="your@gmail.com"
$env:SKILLFORGE_IMAP_PASSWORD="gmail-app-password"
$env:SKILLFORGE_IMAP_MAILBOX="INBOX"
$env:SKILLFORGE_OPENCLAW_COMMAND="openclaw"
```

Fetch unread email through IMAP and enrich each message through OpenClaw before writing `activity_events.jsonl`:

```powershell
python -m autoskill_agent.cli imap-poll --once --openclaw-mode openclaw
```

For an offline deterministic demo without a live OpenClaw binary:

```powershell
python -m autoskill_agent.cli imap-poll --once --openclaw-mode mock
```

Write OpenClaw-enriched matching email events into the onboarding tracker workbook and emit the matching `spreadsheet_row_updated` activity event:

```powershell
python -m autoskill_agent.cli email-to-excel --workbook workspace/workbooks/onboarding_tracker.xlsx --yes
```

The Excel path uses `openpyxl`. Install it in the active Python environment or run with a Python runtime that already includes it.

Run the integrated Section A -> Section B demo:

```powershell
cd D:\hackathon
python -m autoskill_agent.cli skillgen-section-a-demo --reset --execute
```

This runs deterministic Section A activity detection from `tests/fixtures/cash_recon_events.jsonl`, writes `workspace/events/workflow_episodes.jsonl` and `workspace/events/skill_candidates.jsonl`, then feeds the candidate into Team B review, skill installation, event matching, preview, approval, local workbook output, draft output, validation, and SkillOps.

Run the end-to-end local demo:

```powershell
cd D:\hackathon
python -m autoskill_agent.cli skillgen-demo --reset
```

It consumes a `PatternCandidate`, creates a human review session, compiles `skill.yaml`, writes the skill bundle, registers it in SQLite, matches a new inbound finance email event, previews execution, requires approval, writes local outputs, validates the run, and records SkillOps metrics.

The default planner is deterministic and does not call a model. To use the local Qwen model through the OpenClaw/Ollama-compatible config:

```powershell
python -m autoskill_agent.cli skillgen-model-check
python -m autoskill_agent.cli skillgen-review --candidate-id cand_daily_cash_recon_001 --planner local-model
```

The local model planner can refine only the review-facing description, workflow steps, expected outcome, and validation rule names. The generated skill is still schema-validated before install, and invalid or unavailable model output falls back to deterministic generation.

See `docs/skill-generation.md` for the step-by-step commands and generated artifact map.
