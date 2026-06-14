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

Run the end-to-end local demo:

```powershell
cd D:\hackathon
python -m autoskill_agent.cli skillgen-demo --reset
```

It consumes a `PatternCandidate`, creates a human review session, compiles `skill.yaml`, writes the skill bundle, registers it in SQLite, matches a new inbound finance email event, previews execution, requires approval, writes local outputs, validates the run, and records SkillOps metrics.

See `docs/skill-generation.md` for the step-by-step commands and generated artifact map.
