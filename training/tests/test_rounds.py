"""Rounds of continued training (training/select_round.py) and the Kaggle runner's bookkeeping (training/kaggle_run.py), without network.

    python3 -m unittest discover -s training/tests
"""
import gzip
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import kaggle_run  # noqa: E402
import select_round  # noqa: E402


def pool(own=200, per_source=300):
    """Own samples plus imported ones in several languages, families and sources."""
    meta = [(f"site:{index}", "hanogt-site", "TR" if index % 2 else "EN", "site") for index in range(own)]
    layout = [
        ("hf-tr-chat", "TR", "chat"), ("hf-tr-science", "TR", "science"), ("hf-en-math", "EN", "math-reasoning"),
        ("hf-en-code", "EN", "code-solve"), ("hf-en-code-2", "EN", "code-solve"), ("hf-de-chat", "DE", "chat"),
        ("hf-az-chat", "AZ", "chat"), ("hf-ru-chat", "RU", "chat"), ("hf-en-security", "EN", "security"), ("hf-en-judge", "EN", "judge"),
    ]
    for source, lang, family in layout:
        meta.extend((f"{source}:{index}", source, lang, family) for index in range(per_source))
    return meta


class SelectRoundTests(unittest.TestCase):
    def test_first_round_balances_languages_and_shares(self):
        meta = pool(own=400)
        chosen = select_round.select(meta, set(), 1, 2000)
        self.assertEqual(len(chosen["replay"]), 0, "nothing learned yet")
        self.assertEqual(len(chosen["own"]), 300, "15% Hanogt")
        self.assertEqual(len(chosen["new"]) + len(chosen["own"]), 2000)
        self.assertEqual(len(set(chosen["new"])), len(chosen["new"]), "no sample twice")
        by_lang = {}
        lookup = {item[0]: item for item in meta}
        for item_id in chosen["new"]:
            lang = lookup[item_id][2]
            by_lang[lang] = by_lang.get(lang, 0) + 1
        for lang in ("TR", "EN", "DE", "AZ", "RU"):
            self.assertGreater(by_lang.get(lang, 0), 0, lang)
        # Two code sources share the code quota (round-robin), neither crowds out the other.
        code = [lookup[item_id][1] for item_id in chosen["new"] if lookup[item_id][3] == "code-solve"]
        self.assertLessEqual(abs(code.count("hf-en-code") - code.count("hf-en-code-2")), 1)

    def test_rounds_are_deterministic(self):
        meta = pool()
        self.assertEqual(select_round.select(meta, set(), 1, 1500), select_round.select(meta, set(), 1, 1500))

    def test_next_round_learns_new_samples_and_replays_old_ones(self):
        meta = pool()
        first = select_round.select(meta, set(), 1, 2000)
        seen = set(first["new"])
        second = select_round.select(meta, seen, 2, 2000)
        self.assertFalse(seen & set(second["new"]), "new means new")
        self.assertEqual(len(second["replay"]), 300)
        self.assertTrue(set(second["replay"]) <= seen, "replay comes from learned samples")

    def test_an_exhausted_pool_gives_no_new_samples(self):
        meta = pool(own=10, per_source=5)
        imported = {item[0] for item in meta if item[3] != "site"}
        chosen = select_round.select(meta, imported, 5, 1000)
        self.assertEqual(chosen["new"], [])

    def test_allocate_respects_availability(self):
        quota = select_round.allocate(100, {"a": 0.5, "b": 0.5}, {"a": 10, "b": 500})
        self.assertEqual(quota["a"], 10)
        self.assertEqual(quota["a"] + quota["b"], 100)
        self.assertEqual(select_round.allocate(10, {"a": 1.0}, {"a": 0}), {"a": 0})

    def test_command_line_writes_the_round_and_its_summary(self):
        with tempfile.TemporaryDirectory() as folder:
            pool_path = os.path.join(folder, "train.jsonl.gz")
            with gzip.open(pool_path, "wt", encoding="utf-8") as handle:
                for item_id, source, lang, family in pool(own=20, per_source=30):
                    handle.write(json.dumps({"id": item_id, "source": source, "lang": lang, "family": family, "messages": []}) + "\n")
            out = os.path.join(folder, "round-001.jsonl.gz")
            select_round.main(["--pool", pool_path, "--round", "1", "--size", "100", "--out", out])
            with gzip.open(out, "rt", encoding="utf-8") as handle:
                lines = [json.loads(line) for line in handle]
            with open(os.path.join(folder, "round-001.json"), encoding="utf-8") as handle:
                summary = json.load(handle)
            self.assertEqual(len(lines), 100)
            self.assertEqual(summary["samples"], 100)
            self.assertEqual(len(summary["newIds"]), summary["new"])


class RunnerTests(unittest.TestCase):
    REGISTRY = {"sources": [
        {"id": "hf-a", "kind": "hf", "status": "allowed", "repo": "x/a"},
        {"id": "hf-b", "kind": "hf", "status": "allowed", "repo": "x/b"},
        {"id": "hf-c", "kind": "hf", "status": "review", "repo": "x/c"},
        {"id": "gh", "kind": "github", "status": "allowed", "repo": "x/gh"},
    ]}

    def test_only_changed_or_failed_sources_are_imported_again(self):
        wanted = kaggle_run.hf_wanted(self.REGISTRY, "code1")
        self.assertEqual(sorted(wanted), ["hf-a", "hf-b"], "review sources aren't imported")
        manifest = {"hf": {"hf-a": {"fingerprint": wanted["hf-a"]}, "hf-b": {"fingerprint": wanted["hf-b"], "error": "timeout"}, "hf-old": {"fingerprint": "x"}}}
        todo, removed = kaggle_run.import_plan(self.REGISTRY, manifest, "code1")
        self.assertEqual(todo, ["hf-b"])
        self.assertEqual(removed, ["hf-old"])
        # A changed importer re-imports everything; a changed entry re-imports that source.
        self.assertEqual(sorted(kaggle_run.import_plan(self.REGISTRY, manifest, "code2")[0]), ["hf-a", "hf-b"])
        changed = {"sources": [{**self.REGISTRY["sources"][0], "cap": 5}, *self.REGISTRY["sources"][1:]]}
        self.assertIn("hf-a", kaggle_run.import_plan(changed, manifest, "code1")[0])

    def test_pool_version_follows_its_inputs(self):
        manifest = {"github": {"fingerprint": "g1"}, "hf": {"hf-a": {"fingerprint": "a1"}, "hf-b": {"fingerprint": "b1", "error": "x"}}}
        base = kaggle_run.pool_version(manifest, "site1", "mix1")
        self.assertEqual(base, kaggle_run.pool_version(json.loads(json.dumps(manifest)), "site1", "mix1"))
        self.assertNotEqual(base, kaggle_run.pool_version(manifest, "site2", "mix1"), "site knowledge changed")
        self.assertNotEqual(base, kaggle_run.pool_version({**manifest, "github": {"fingerprint": "g2"}}, "site1", "mix1"))
        failed_changed = {**manifest, "hf": {**manifest["hf"], "hf-b": {"fingerprint": "b2", "error": "y"}}}
        self.assertEqual(base, kaggle_run.pool_version(failed_changed, "site1", "mix1"), "a failed import isn't in the pool")

    def test_round_bookkeeping(self):
        state = kaggle_run.empty_state()
        self.assertEqual(kaggle_run.next_round_number(state), 1)
        state["active"] = {"round": 1, "file": "rounds/round-001.jsonl.gz", "pool": "v1"}
        self.assertEqual(kaggle_run.next_round_number(state), 2)
        done = kaggle_run.finish_round(state, {"status": "finished", "step": 120, "metrics": {"eval_loss": 1.2}})
        self.assertIsNone(done["active"])
        self.assertEqual(done["rounds"][0]["round"], 1)
        self.assertEqual(done["rounds"][0]["steps"], 120)
        self.assertNotIn("file", done["rounds"][0])
        self.assertEqual(kaggle_run.next_round_number(done), 2)

    def test_training_plans_follow_model_size_and_gpus(self):
        t4 = 15.8e9
        # Qwen3.5-4B: 16-bit LoRA fits one T4, so each GPU gets a copy; QLoRA stays as the last resort.
        self.assertEqual(kaggle_run.training_plans("qwen3_5", 4.66e9, [t4, t4]), [{"processes": 2, "bits": 16}, {"processes": 1, "bits": 16}, {"processes": 2, "bits": 4}])
        # Qwen3.5-9B: too big for one T4 in 16 bits, fits split over two.
        self.assertEqual(kaggle_run.training_plans("qwen3_5", 9.65e9, [t4, t4]), [{"processes": 1, "bits": 16}, {"processes": 2, "bits": 4}])
        # 27B on two T4s: only QLoRA; on one 80 GB GPU: 16-bit.
        self.assertEqual(kaggle_run.training_plans("qwen3_5", 27.4e9, [t4, t4]), [{"processes": 2, "bits": 4}])
        self.assertEqual(kaggle_run.training_plans("qwen3_5", 27.4e9, [80e9])[0], {"processes": 1, "bits": 16})
        # Other architectures keep QLoRA; an unknown size too.
        self.assertEqual(kaggle_run.training_plans("qwen3", 8.2e9, [t4, t4]), [{"processes": 2, "bits": 4}])
        self.assertEqual(kaggle_run.training_plans("qwen3_5", None, [t4]), [{"processes": 1, "bits": 4}])

    def test_each_base_has_its_own_repository_and_rounds(self):
        self.assertEqual(kaggle_run.model_repo_for("Qwen/Qwen3.5-4B", "HanStudios"), "HanStudios/hanogt-ai-qwen3.5-4b-lora")
        self.assertEqual(kaggle_run.model_repo_for("Qwen/Qwen3-8B", "HanStudios"), "HanStudios/hanogt-ai-qwen3-8b-lora", "the earlier repository name")

        class Args:
            model_repo = "HanStudios/hanogt-ai-qwen3.5-4b-lora"

        self.assertEqual(kaggle_run.rounds_folder(Args), "rounds/hanogt-ai-qwen3.5-4b-lora")

    def test_trial_samples_are_long_but_typical(self):
        with tempfile.TemporaryDirectory() as folder:
            pool_path = os.path.join(folder, "train.jsonl.gz")
            with gzip.open(pool_path, "wt", encoding="utf-8") as handle:
                for index in range(200):
                    handle.write(json.dumps({"id": str(index), "messages": [{"role": "user", "content": "x" * (index * 10)}]}) + "\n")
            target = os.path.join(folder, "trial.jsonl")
            self.assertTrue(kaggle_run.trial_samples(pool_path, target, count=5))
            with open(target, encoding="utf-8") as handle:
                lengths = [len(json.loads(line)["messages"][0]["content"]) for line in handle]
            self.assertEqual(len(lengths), 5)
            self.assertTrue(all(1800 <= length <= 1900 for length in lengths), lengths)

    def test_trainer_command_carries_the_plan(self):
        class Args:
            base_model = "Qwen/Qwen3.5-4B"
            max_seq_len = 4096

        ddp = kaggle_run.trainer_command(Args, {"processes": 2, "bits": 16}, "d.jsonl", "", "out")
        self.assertEqual(ddp[:2], ["torchrun", "--nproc_per_node=2"])
        self.assertIn("--no-4bit", ddp)
        single = kaggle_run.trainer_command(Args, {"processes": 1, "bits": 4}, "d.jsonl", "", "out")
        self.assertEqual(single[0], sys.executable)
        self.assertIn("--force-4bit", single)

    def settle(self, returncodes, saved=None, kernels=False, memory=(15.8e9, 15.8e9)):
        """settle_trainer() with the hub, the GPUs and the trial runs replaced: (plan, args, commands, saved states)."""

        class Args:
            base_model = "Qwen/Qwen3.5-4B"
            fallback_base = "Qwen/Qwen3-8B"
            model_repo = "HanStudios/hanogt-ai-qwen3.5-4b-lora"
            max_seq_len = 4096

        commands, saves = [], []
        codes = iter(returncodes)

        def fake_run(command, cwd=None, check=None):
            commands.append([str(part) for part in command])
            code = 0 if "uninstall" in command else next(codes)
            return mock.Mock(returncode=code)

        facts = {"Qwen/Qwen3.5-4B": ("qwen3_5", 4.66e9), "Qwen/Qwen3-8B": ("qwen3", 8.2e9)}
        with tempfile.TemporaryDirectory() as folder, \
                mock.patch.object(kaggle_run, "api"), \
                mock.patch.object(kaggle_run, "load_state", side_effect=lambda args, _folder: ({**kaggle_run.empty_state(), **({"trainer": saved} if saved else {})}, set())), \
                mock.patch.object(kaggle_run, "save_state", side_effect=lambda args, state, _folder, seen=None: saves.append((args.model_repo, dict(state)))), \
                mock.patch.object(kaggle_run, "model_facts", side_effect=lambda base, _folder: facts[base]), \
                mock.patch.object(kaggle_run, "gpu_memory", return_value=list(memory)), \
                mock.patch.object(kaggle_run, "trial_samples", return_value=True), \
                mock.patch.object(kaggle_run, "fast_kernels_installed", return_value=kernels), \
                mock.patch.object(kaggle_run.subprocess, "run", side_effect=fake_run), \
                mock.patch.object(kaggle_run, "say"):
            plan, state, seen, _ = kaggle_run.settle_trainer(Args, folder, "pool.jsonl.gz", "HanStudios")
        return plan, Args, commands, saves

    def test_a_saved_plan_is_reused_without_a_trial(self):
        plan, _args, commands, _saves = self.settle([], saved={"base": "Qwen/Qwen3.5-4B", "plan": {"processes": 2, "bits": 16}})
        self.assertEqual(plan, {"processes": 2, "bits": 16})
        self.assertEqual(commands, [])

    def test_the_first_plan_that_survives_the_trial_is_kept(self):
        plan, args, commands, saves = self.settle([1, 0])
        self.assertEqual(plan, {"processes": 1, "bits": 16}, "two copies didn't fit; the split model did")
        self.assertEqual(commands[0][:2], ["torchrun", "--nproc_per_node=2"])
        self.assertIn("--max-steps", commands[0])
        self.assertEqual(saves[-1][1]["trainer"]["plan"], plan)
        self.assertEqual(args.base_model, "Qwen/Qwen3.5-4B")

    def test_without_fast_kernels_then_the_fallback_base(self):
        # Three plans fail with the fast kernels, three without them, then Qwen3-8B's QLoRA works.
        plan, args, commands, saves = self.settle([1, 1, 1, 1, 1, 1, 0], kernels=True)
        self.assertTrue(any("uninstall" in command for command in commands))
        self.assertEqual(plan, {"processes": 2, "bits": 4})
        self.assertEqual(args.base_model, "Qwen/Qwen3-8B")
        self.assertEqual(args.model_repo, "HanStudios/hanogt-ai-qwen3-8b-lora", "the fallback keeps its adapters apart")
        self.assertEqual(saves[-1][0], "HanStudios/hanogt-ai-qwen3-8b-lora")

    def test_nothing_trains(self):
        plan, _args, _commands, _saves = self.settle([1, 1, 1, 1])
        self.assertIsNone(plan)

    def test_files_hash_changes_with_content(self):
        with tempfile.TemporaryDirectory() as folder:
            os.makedirs(os.path.join(folder, "d"))
            with open(os.path.join(folder, "d", "a.txt"), "w", encoding="utf-8") as handle:
                handle.write("1")
            first = kaggle_run.files_hash(["d"], root=folder)
            with open(os.path.join(folder, "d", "a.txt"), "w", encoding="utf-8") as handle:
                handle.write("2")
            self.assertNotEqual(first, kaggle_run.files_hash(["d"], root=folder))


if __name__ == "__main__":
    unittest.main()
