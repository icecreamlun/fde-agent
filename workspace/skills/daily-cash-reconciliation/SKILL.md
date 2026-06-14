# Daily Cash Reconciliation Skill

## Purpose

Use this skill when the finance team receives a daily bank transaction email and needs to update the local cash reconciliation workbook.

## Trigger

- `trigger_email_received_daily_cash_reconciliation` (email_received): new daily bank transaction email
  - Subject starts with Daily bank transactions - Jun
  - Attachment matches bank_transactions_*.xlsx
  - Required file exists: workspace/workbooks/skillforge_finance_demo_cash_recon.xlsx
  - Workbook workspace/workbooks/skillforge_finance_demo_cash_recon.xlsx has sheet Daily Reconciliation
  - No existing reconciliation row for the email date

## Inputs

- `inbound_attachment` (xlsx_attachment)
- `target_workbook` (xlsx_workbook)
- `daily_reconciliation_sheet` (workbook_sheet)
- `payment_export_sheet` (workbook_sheet)
- `lists_rules_sheet` (workbook_sheet)

## Workflow Steps

1. Read bank attachment rows: Read the inbound attachment rows that triggered the repeated workflow.
2. Match transactions against Payment Export: Compare inbound rows against supporting workbook data for Daily Reconciliation.
3. Compute Amount Diff: Perform the repeated action: compute Amount Diff.
4. Preview Daily Reconciliation row updates: Prepare row updates for Daily Reconciliation without writing them yet.
5. Fill Match Status: Compare inbound rows against supporting workbook data for Daily Reconciliation.
6. Fill Exception Reason: Populate the Exception Reason field in the proposed workbook update.
7. Fill Reviewer: Populate the Reviewer field in the proposed workbook update.
8. Fill Reviewed At: Populate the Reviewed At field in the proposed workbook update.
9. Fill Source Email ID: Populate the Source Email ID field in the proposed workbook update.
10. Fill Skill Run ID: Populate the Skill Run ID field in the proposed workbook update.
11. Draft summary reply: Create a local outbound reply draft summarizing the run result.
12. Request human approval: Ask a reviewer to approve the workbook update and reply draft before any write occurs.
13. Create reconciled spreadsheet: After approval, create a new spreadsheet containing the previewed Daily Reconciliation updates.
14. Write audit log: Record validation results, output paths, and SkillOps usage evidence.

## Expected Outcome

The approved run creates a new reconciled spreadsheet for Daily Reconciliation, creates any required local draft outputs, and records audit/SkillOps evidence without forbidden side effects.

Files created:

- `workspace/workbooks/generated/{source_workbook}_{event_date}_reconciled.xlsx`
- `workspace/mail/drafts/{skill_id}_{event_date}_reply.eml`

Files modified:

- `workspace/workbooks/skillforge_finance_demo_cash_recon.skill_updates.jsonl`
- `workspace/events/events.jsonl`

Side effects:

- Do not access the network.
- Do not modify closed-period sheets.
- Do not overwrite reviewed rows.
- Do not read outside the workspace.
- Do not send email automatically.
- Require human approval before workbook changes.

## Guardrails

- Do not access the network.
- Do not modify closed-period sheets.
- Do not overwrite reviewed rows.
- Do not read outside the workspace.
- Do not send email automatically.
- Require human approval before workbook changes.

## Success Criteria

- `workbook_can_be_reopened`
- `only_allowed_sheets_modified`
- `no_closed_period_sheets_modified`
- `no_reviewed_rows_overwritten`
- `reconciled_spreadsheet_created`
- `exception_count_matches_summary`
- `draft_created_but_not_sent`
- `audit_log_written`
- `target_rows_match_next_trigger`
- `field_populated_recon_date`
- `field_populated_txn_id`
- `field_populated_bank_ref`
- `field_populated_bank_date`
- `field_populated_bank_description`
- `field_populated_bank_amount`
- `field_populated_erp_ref`
- `field_populated_erp_date`
- `field_populated_erp_description`
- `field_populated_erp_amount`
- `field_populated_amount_diff`
- `field_populated_match_status`
- `field_populated_exception_reason`
- `field_populated_reviewer`
- `field_populated_reviewed_at`
- `field_populated_source_email_id`
- `field_populated_skill_run_id`
- `field_populated_notes`
