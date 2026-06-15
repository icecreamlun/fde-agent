# SkillForge Feedback Fine-Tuning Report

Date: 2026-06-14

## Executive Summary

This experiment shows that a small local model can be fine-tuned from user feedback to produce valid SkillForge planner JSON for the skill-generation stage.

The experiment was intentionally isolated from the running `fde-agent` application. No model adapter was wired into production code, and the fine-tuned model is only a proof artifact under `/home/dell/skillforge-feedback-ft`.

Result: the base `Qwen3-0.6B` model failed the strict planner-output eval, while the LoRA-tuned adapter passed the held-out planner-output eval used in this proof.

## What Was Trained

Task: refine the internal SkillForge skill planner output.

Input:

- Section A skill candidate
- Deterministic base plan
- User feedback batch
- Allowed step types
- Allowed executor action types
- Required safety invariants

Output:

The model must return exactly these top-level fields:

- `description`
- `workflow_steps`
- `expected_outcome`
- `validation_rules`

The model must not return or modify top-level runtime-control fields such as:

- `triggers`
- `permissions`
- `resources`
- `guardrails`

This matches the intended safe boundary in `fde-agent`: the model may improve review/planning text, but it should not control trigger policy, permissions, or production execution behavior.

## Data Used

All data was derived from the local SkillForge finance demo artifacts, not from the live runtime model configuration.

Source artifacts:

- `/home/dell/skillforge-feedback-ft/raw/skill_candidates.jsonl`
- `/home/dell/skillforge-feedback-ft/raw/review_cand_daily_cash_recon_001.json`
- `/home/dell/skillforge-feedback-ft/raw/skill.json`

Business workflow:

- Pattern: `daily_cash_reconciliation`
- Episodes: 3
- Active skill: `daily_cash_reconciliation`
- Domain: offline finance team cash reconciliation

Generated experiment datasets:

- `datasets/feedback_events.jsonl`: 12 simulated human feedback events
- `datasets/sft_train.jsonl`: 32 supervised fine-tuning rows
- `datasets/eval.jsonl`: 30 held-out eval rows
- `datasets/preference_train.jsonl`: 32 chosen/rejected rows for possible future DPO/RL-style training

The 12 feedback events cover issues such as:

- Description too generic
- Human approval must happen before writes
- Draft reply must not be sent automatically
- Validation rules must be concrete
- No network access
- Reconciled spreadsheet artifact must be explicit
- Audit and SkillOps evidence must be recorded
- No invented executor actions
- Reviewed rows must not be overwritten
- Exception count must match the summary
- Planner must not change triggers or permissions
- Payment Export matching must be included

## Model and Algorithm

Base model:

- `unsloth/Qwen3-0.6B-unsloth-bnb-4bit`

Fine-tuning method:

- Supervised fine-tuning (SFT)
- LoRA adapter training
- Prompt tokens masked from loss; only the assistant JSON response is trained
- 4-bit base model loading
- BF16 training
- `adamw_8bit` optimizer

LoRA configuration:

- Rank: `r = 8`
- Alpha: `16`
- Dropout: `0`
- Target modules:
  - `q_proj`
  - `k_proj`
  - `v_proj`
  - `o_proj`
  - `gate_proj`
  - `up_proj`
  - `down_proj`

Training configuration:

- Train rows: 32
- Feedback rows: 12
- Minimum feedback gate: 10
- Max steps: 50
- Learning rate: `1e-4`
- Batch size per device: 1
- Gradient accumulation: 4
- Effective batch size: 4
- Trainable parameters: about 5.05M of 601.10M, or about 0.84%
- Runtime: 157.7 seconds
- Final train loss: 0.09827

This was not full-model fine-tuning. Only a small LoRA adapter was trained, which reduces blast radius and makes rollback trivial.

## Training Curve

The loss decreased smoothly during training and did not show instability.

| Step | Epoch | Loss | Grad Norm | Learning Rate |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.125 | 0.417048 | 0.802391 | 0.00000000 |
| 5 | 0.625 | 0.355745 | 0.617828 | 0.00009787 |
| 10 | 1.250 | 0.189100 | 0.459487 | 0.00008723 |
| 15 | 1.875 | 0.126085 | 0.342114 | 0.00007660 |
| 20 | 2.500 | 0.066385 | 0.267103 | 0.00006596 |
| 25 | 3.125 | 0.040181 | 0.211597 | 0.00005532 |
| 30 | 3.750 | 0.020277 | 0.159143 | 0.00004468 |
| 35 | 4.375 | 0.007739 | 0.096894 | 0.00003404 |
| 40 | 5.000 | 0.004735 | 0.063535 | 0.00002340 |
| 45 | 5.625 | 0.003475 | 0.052645 | 0.00001277 |
| 50 | 6.250 | 0.004931 | 0.091756 | 0.00000213 |

Interpretation:

- Loss moved from about `0.42` to about `0.005` by the end.
- Grad norm decreased with the loss and stayed stable.
- The final small loss uptick at step 50 is minor and not a training divergence signal.
- Because the dataset is intentionally small, this curve should be read as proof of learnability, not as a production convergence study.

## Evaluation

Evaluation used held-out paraphrased feedback prompts. The eval prompts were not exact copies of the training prompts.

The strict scorer checked:

- Output is parseable JSON
- Required top-level keys are present
- Forbidden top-level keys are absent
- `workflow_steps` has the required object shape
- Required step types are present
- Required executor action types are present
- Human approval appears before workbook write
- `expected_outcome` has the required shape
- Validation rules are concrete enough
- Required finance/offline/approval/audit terms are present

Fair comparison using 5 held-out eval rows with `max_new_tokens=2500`:

| Metric | Base Qwen3-0.6B | LoRA Adapter |
| --- | ---: | ---: |
| Parseable JSON | 1.00 | 1.00 |
| Required top-level keys | 0.00 | 1.00 |
| Workflow step shape | 0.00 | 1.00 |
| Required action types | 0.00 | 1.00 |
| Approval before write | 0.00 | 1.00 |
| Expected outcome shape | 0.00 | 1.00 |
| Validation rules | 0.00 | 1.00 |
| Required term coverage | 0.846 | 1.00 |
| Strict pass | 0.00 | 1.00 |

Observation:

- The base model often copied or reshaped the prompt payload instead of returning the bounded planner object.
- The fine-tuned adapter returned the expected planner JSON structure.
- The adapter preserved the important safety constraints: local-only execution, no automatic email sending, no network access, no reviewed-row overwrite, and human approval before write.

## Overfitting Controls

This experiment used several controls to reduce overfitting risk:

- The eval prompts used paraphrased feedback text, not exact training prompt copies.
- Training rows with exact eval prompt keys were excluded.
- Only a LoRA adapter was trained, not the full base model.
- The task output was bounded to four planner fields.
- The model was not allowed to modify triggers, permissions, resources, or guardrails.
- The adapter was not connected to the running `fde-agent` service.
- The eval checks were structural and behavioral, not exact-string equality.

Conclusion on overfitting:

There is no evidence of memorization failure in this narrow held-out paraphrase eval: the model generalized from the feedback examples to unseen wording and produced compliant planner JSON.

However, this is still a small proof-of-feasibility dataset. For production confidence, the next eval should include more workflow families, more negative examples, and real human feedback. The current result proves the direction is viable, not that the adapter is production-ready.

## Why This Is Feasible

The result is feasible because the model is not learning the entire finance application. It is learning a narrow bounded transformation:

`candidate + deterministic plan + feedback -> improved planner JSON`

The deterministic system still owns the dangerous parts:

- Trigger rules
- Permissions
- Runtime execution
- Validation enforcement
- Human approval
- Audit writing

The model only improves the planner draft inside a constrained contract.

## Artifacts

Adapter:

- `/home/dell/skillforge-feedback-ft/outputs/qwen3-0.6b-feedback-planner-lora-v1/adapter_model.safetensors`

Training metadata:

- `/home/dell/skillforge-feedback-ft/outputs/qwen3-0.6b-feedback-planner-lora-v1/train_split_meta.json`
- `/home/dell/skillforge-feedback-ft/outputs/qwen3-0.6b-feedback-planner-lora-v1/train_result.json`
- `/home/dell/skillforge-feedback-ft/outputs/qwen3-0.6b-feedback-planner-lora-v1/checkpoint-50/trainer_state.json`

Eval reports:

- `/home/dell/skillforge-feedback-ft/reports/baseline_qwen3_0_6b_eval_5_long.json`
- `/home/dell/skillforge-feedback-ft/reports/after_qwen3_0_6b_lora_eval_5_long.json`
- `/home/dell/skillforge-feedback-ft/reports/comparison_summary.json`

Dataset:

- `/home/dell/skillforge-feedback-ft/datasets/manifest.json`
- `/home/dell/skillforge-feedback-ft/datasets/feedback_events.jsonl`
- `/home/dell/skillforge-feedback-ft/datasets/sft_train.jsonl`
- `/home/dell/skillforge-feedback-ft/datasets/eval.jsonl`
- `/home/dell/skillforge-feedback-ft/datasets/preference_train.jsonl`

## Recommended Next Step

The next step should not be wiring this adapter into `fde-agent` yet.

Recommended sequence:

1. Add 2-3 more finance workflow families.
2. Collect real human accepted/rejected planner revisions.
3. Expand eval to at least 100 held-out cases.
4. Add negative tests for unsafe outputs.
5. Try DPO or online preference optimization only after the reward criteria are explicit.
6. Keep the production runtime on deterministic validation even if a tuned planner is used.

