from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from autoskill_agent import skillgen


class SkillGenerationTests(unittest.TestCase):
    def test_installs_skill_bundle_from_pattern_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            skillgen.bootstrap_demo(root, force=True)
            review = skillgen.create_review_session(root, "cand_daily_cash_recon_001")
            feedback = skillgen.default_human_feedback(root, review["review_session_id"])
            submit = skillgen.submit_feedback(root, review["review_session_id"], feedback)
            install = skillgen.install_skill(root, review["review_session_id"])

            self.assertEqual(submit["status"], "ok")
            self.assertEqual(install["status"], "installed")

            skill_dir = Path(install["skill_dir"])
            self.assertTrue((skill_dir / "skill.yaml").exists())
            self.assertTrue((skill_dir / "SKILL.md").exists())
            self.assertTrue((skill_dir / "policy.yaml").exists())
            self.assertTrue((skill_dir / "examples" / "episode_001.json").exists())
            self.assertTrue((skill_dir / "tests" / "validation_cases.json").exists())
            self.assertTrue((skill_dir / "audit_schema.json").exists())

            yaml_text = (skill_dir / "skill.yaml").read_text(encoding="utf-8")
            skill_json = skillgen.read_json(skill_dir / "skill.json")
            self.assertIn('schema_version: "skill.workflow.v1"', yaml_text)
            self.assertIn('skill_id: "daily_cash_reconciliation"', yaml_text)
            self.assertIn("triggers:", yaml_text)
            self.assertIn("workflow:", yaml_text)
            self.assertIn("expected_outcome:", yaml_text)
            self.assertIn('type: "human_approval"', yaml_text)
            self.assertIn("network: false", yaml_text)
            self.assertIn("send_email: false", yaml_text)
            self.assertEqual(skill_json["schema_version"], "skill.workflow.v1")
            self.assertEqual(skill_json["source_candidate"]["contract_version"], "section_a.skill_candidate.v1")
            self.assertEqual(skill_json["triggers"][0]["conditions"][0]["field"], "email.subject")
            self.assertEqual(skill_json["triggers"][0]["conditions"][0]["operator"], "starts_with")
            self.assertEqual(skill_json["workflow"]["steps"][0]["order"], 1)
            approval_steps = [step for step in skill_json["workflow"]["steps"] if step["type"] == "human_approval"]
            write_steps = [step for step in skill_json["workflow"]["steps"] if step.get("action_type") == "write_xlsx_update"]
            self.assertEqual(len(approval_steps), 1)
            self.assertEqual(len(write_steps), 1)
            self.assertLess(approval_steps[0]["order"], write_steps[0]["order"])
            self.assertIn("summary", skill_json["workflow"]["expected_outcome"])

    def test_reads_section_a_skill_candidates_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            skillgen.bootstrap_demo(root, force=True)

            candidates = skillgen.read_section_a_candidates(root)
            self.assertEqual(len(candidates), 1)
            self.assertEqual(candidates[0]["contract_version"], "section_a.skill_candidate.v1")

            review = skillgen.create_review_session(root, "cand_daily_cash_recon_001")
            self.assertEqual(review["source_contract_version"], "section_a.skill_candidate.v1")
            self.assertEqual(review["suggested"]["trigger"]["conditions"][0]["type"], "subject_prefix")
            self.assertEqual(review["suggested"]["inputs"][1]["path"], "workspace/workbooks/cash_recon.xlsx")
            self.assertGreater(len(review["suggested"]["workflow_steps"]), 7)

    def test_matches_previews_executes_and_tracks_skillops(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            result = skillgen.run_full_skillgen_demo(root, force=True)

            self.assertEqual(result["install"]["status"], "installed")
            self.assertGreaterEqual(len(result["matches"]), 1)
            self.assertIsNotNone(result["preview"])
            self.assertIsNotNone(result["execution"])
            self.assertFalse(result["execution"]["network_used"])
            self.assertFalse(result["execution"]["email_sent"])
            self.assertEqual(result["execution"]["validation"]["status"], "passed")
            self.assertIn("workbook_created", result["execution"]["outputs"])

            paths = skillgen.paths(root)
            self.assertTrue((paths.drafts_dir / "cash_recon_2026_06_15_reply.eml").exists())
            self.assertTrue((paths.workbooks_dir / "cash_recon.skill_updates.jsonl").exists())
            self.assertTrue((paths.workbooks_dir / "generated" / "cash_recon_2026_06_15_reconciled.xlsx").exists())
            self.assertGreaterEqual(result["skillops"]["skills"][0]["runs"], 1)
            self.assertTrue(result["skillops"]["recommendations"])

    def test_candidate_validation_reports_missing_fields(self) -> None:
        validation = skillgen.validate_candidate({"candidate_id": "bad"})
        self.assertEqual(validation["status"], "needs_more_evidence")
        self.assertIn("suggested_inputs", validation["missing_fields"])


if __name__ == "__main__":
    unittest.main()
