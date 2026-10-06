"""Converters of training/import_hf.py, on hand-made rows (no network).

    python3 -m unittest discover -s training/tests
"""
import json
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import import_hf  # noqa: E402

SOURCE = {"id": "hf-test", "license": "Apache-2.0", "family": ["chat"]}


class ConverterTests(unittest.TestCase):
    def test_generic_layouts(self):
        layouts = [
            {"messages": [{"role": "user", "content": "Merhaba"}, {"role": "assistant", "content": "Selam!"}]},
            {"conversations": [{"from": "human", "value": "Hi"}, {"from": "gpt", "value": "Hello!"}]},
            {"system": "Kısa yanıt ver.", "user": "2+2?", "assistant": "4"},
            {"instruction": "Topla", "input": "2 ve 3", "output": "5"},
            {"prompt": "Soru", "response": "Yanıt"},
            {"question": "Q", "answer": "A"},
        ]
        for row in layouts:
            item, reason = import_hf.convert_generic(SOURCE, row)
            self.assertIsNone(reason, row)
            self.assertEqual(item["messages"][-1]["role"], "assistant")
            self.assertTrue(any(message["role"] == "user" for message in item["messages"]))
        item, _ = import_hf.convert_generic(SOURCE, layouts[2])
        self.assertEqual(item["messages"][0], {"role": "system", "content": "Kısa yanıt ver."})
        item, _ = import_hf.convert_generic(SOURCE, layouts[3])
        self.assertEqual(item["messages"][0]["content"], "Topla\n\n2 ve 3")

    def test_unusable_rows(self):
        for row in [
            {"text": "only text"},
            {"messages": [{"role": "user", "content": "x"}]},
            {"messages": [{"role": "user", "content": "x"}, {"role": "tool", "content": "{}"}]},
            {"messages": [{"role": "user", "content": "x"}, {"role": "assistant", "content": "", "tool_calls": [{"id": "1"}]}]},
        ]:
            item, reason = import_hf.convert_generic(SOURCE, row)
            self.assertIsNone(item, row)
            self.assertEqual(reason, "shape")

    def test_reasoning_fields(self):
        item, _ = import_hf.convert_generic(SOURCE, {"messages": [{"role": "user", "content": "x"}, {"role": "assistant", "content": "y", "reasoning_content": "because"}]})
        self.assertEqual(item["messages"][-1]["reasoning_content"], "because")
        self.assertEqual(item["family"], "chat-reasoning")
        item, _ = import_hf.convert_generic(SOURCE, {"prompt": "x", "response": "y", "thinking": "hmm"})
        self.assertEqual(item["messages"][-1]["reasoning_content"], "hmm")

    def test_aya_keeps_turkish_and_english(self):
        item, reason = import_hf.convert_aya(SOURCE, {"inputs": "Türkiye'nin başkenti neresi?", "targets": "Ankara.", "language_code": "tur"})
        self.assertIsNone(reason)
        self.assertEqual((item["lang"], item["verified"]), ("TR", "human"))
        item, reason = import_hf.convert_aya(SOURCE, {"inputs": "x", "targets": "y", "language_code": "fra"})
        self.assertIsNone(item)
        self.assertEqual(reason, "language")

    def test_oasst_best_thread(self):
        rows = [
            {"message_id": "r", "parent_id": None, "message_tree_id": "t1", "role": "prompter", "text": "Python nedir?", "lang": "tr"},
            {"message_id": "a1", "parent_id": "r", "message_tree_id": "t1", "role": "assistant", "text": "İkinci yanıt", "rank": 1},
            {"message_id": "a0", "parent_id": "r", "message_tree_id": "t1", "role": "assistant", "text": "En iyi yanıt", "rank": 0},
            {"message_id": "p2", "parent_id": "a0", "message_tree_id": "t1", "role": "prompter", "text": "Örnek?"},
            {"message_id": "a2", "parent_id": "p2", "message_tree_id": "t1", "role": "assistant", "text": "print(1)", "rank": 0},
            {"message_id": "a3", "parent_id": "p2", "message_tree_id": "t1", "role": "assistant", "text": "silindi", "rank": 1, "deleted": True},
            {"message_id": "x", "parent_id": None, "message_tree_id": "t2", "role": "prompter", "text": "Bonjour", "lang": "fr"},
        ]
        threads = list(import_hf.oasst_threads(rows))
        self.assertEqual(len(threads), 1)
        root, thread = threads[0]
        self.assertEqual([item["message_id"] for item in thread], ["r", "a0", "p2", "a2"])
        item = import_hf.convert_oasst_thread(SOURCE, root, thread)
        self.assertEqual(item["lang"], "TR")
        self.assertEqual([message["role"] for message in item["messages"]], ["user", "assistant", "user", "assistant"])

    def test_oasst_drops_a_trailing_prompt(self):
        rows = [
            {"message_id": "r", "parent_id": None, "message_tree_id": "t", "role": "prompter", "text": "Q", "lang": "en"},
            {"message_id": "a", "parent_id": "r", "message_tree_id": "t", "role": "assistant", "text": "A", "rank": 0},
            {"message_id": "p", "parent_id": "a", "message_tree_id": "t", "role": "prompter", "text": "Q2"},
        ]
        (_, thread), = list(import_hf.oasst_threads(rows))
        self.assertEqual(thread[-1]["role"], "assistant")

    def test_opencodeinstruct_score_filter(self):
        good = {"id": "1", "input": "Write add", "output": "def add(a, b): return a + b", "average_test_score": "1.0"}
        self.assertIsNotNone(import_hf.convert_opencodeinstruct(SOURCE, good)[0])
        self.assertEqual(import_hf.convert_opencodeinstruct(SOURCE, {**good, "average_test_score": "0.5"})[1], "low_score")
        self.assertEqual(import_hf.convert_opencodeinstruct(SOURCE, {**good, "average_test_score": None})[1], "no_score")

    def test_openthoughts_keeps_thought_rows_only(self):
        row = {"system": "Your role…", "conversations": [{"from": "user", "value": "2+2?"}, {"from": "assistant", "value": "<|begin_of_thought|>add<|end_of_thought|><|begin_of_solution|>4<|end_of_solution|>"}]}
        item, reason = import_hf.convert_openthoughts(SOURCE, row)
        self.assertIsNone(reason)
        self.assertEqual([message["role"] for message in item["messages"]], ["user", "assistant"])
        no_thought = {"conversations": [{"from": "user", "value": "x"}, {"from": "assistant", "value": "y"}]}
        self.assertEqual(import_hf.convert_openthoughts(SOURCE, no_thought)[1], "no_thought")

    def test_row_filters(self):
        row = {"lang": "tr", "score": 0.95, "meta": {"ok": True}, "empty": ""}
        self.assertTrue(import_hf.passes(row, [{"field": "lang", "equals": "tr"}, {"field": "score", "min": 0.9}, {"field": "meta.ok", "truthy": True}]))
        self.assertFalse(import_hf.passes(row, [{"field": "lang", "in": ["de", "az"]}]))
        self.assertFalse(import_hf.passes(row, [{"field": "lang", "notIn": ["tr"]}]))
        self.assertFalse(import_hf.passes(row, [{"field": "score", "max": 0.5}]))
        self.assertFalse(import_hf.passes(row, [{"field": "missing", "min": 0}]), "no number, no pass")
        self.assertFalse(import_hf.passes(row, [{"field": "empty", "truthy": True}]))

    def test_fields_converter_and_languages(self):
        source = {"id": "hf-q", "license": "MIT", "family": ["science"], "hf": {"converter": "fields", "fields": {"user": ["question", "choices"], "assistant": "answer", "reasoning": "explanation"}, "langField": "language", "langMap": {"deu": "DE", "azj": "AZ"}}}
        spec = import_hf.spec_of(source)
        item, reason = import_hf.convert_row(source, {"question": "Was ist H2O?", "choices": "A) Wasser B) Salz", "answer": "A) Wasser", "explanation": "H2O ist Wasser.", "language": "deu"}, spec)
        self.assertIsNone(reason)
        self.assertEqual(item["lang"], "DE")
        self.assertEqual(item["family"], "science")
        self.assertEqual(item["messages"][0]["content"], "Was ist H2O?\n\nA) Wasser B) Salz")
        self.assertEqual(item["messages"][-1]["reasoning_content"], "H2O ist Wasser.")
        self.assertEqual(import_hf.convert_row(source, {"question": "x", "answer": "y", "language": "fra"}, spec), (None, "language"))
        self.assertEqual(import_hf.convert_row(source, {"question": "", "answer": "y", "language": "deu"}, spec), (None, "shape"))

    def test_messages_converter_options(self):
        source = {"id": "hf-m", "license": "Apache-2.0", "family": ["chat"], "hf": {"converter": "messages", "messagesField": "conversation", "lang": "RU", "verified": "human", "where": [{"field": "quality", "min": 3}], "maxChars": 50}}
        spec = import_hf.spec_of(source)
        row = {"quality": 4, "conversation": [{"role": "user", "content": "Привет"}, {"role": "assistant", "content": "Здравствуйте!"}]}
        item, reason = import_hf.convert_row(source, row, spec)
        self.assertIsNone(reason)
        self.assertEqual((item["lang"], item["verified"]), ("RU", "human"))
        self.assertEqual(import_hf.convert_row(source, {**row, "quality": 1}, spec), (None, "filtered"))
        long_row = {"quality": 5, "conversation": [{"role": "user", "content": "x" * 40}, {"role": "assistant", "content": "y" * 40}]}
        self.assertEqual(import_hf.convert_row(source, long_row, spec), (None, "too_long"))

    def test_legacy_sources_keep_their_converters(self):
        self.assertEqual(import_hf.spec_of({"id": "hf-opencodeinstruct"})["keep"], 0.25)
        self.assertEqual(import_hf.spec_of({"id": "hf-aya-dataset", "hf": {"langMap": {"deu": "DE"}}})["converter"], "aya")
        aya = {"id": "hf-aya-dataset", "license": "Apache-2.0", "family": ["chat"]}
        spec = import_hf.spec_of({**aya, "hf": {"langMap": {"tur": "TR", "deu": "DE", "azj": "AZ", "rus": "RU"}}})
        item, reason = import_hf.convert_row(aya, {"inputs": "Wie spät ist es?", "targets": "Es ist acht.", "language_code": "deu"}, spec)
        self.assertIsNone(reason)
        self.assertEqual(item["lang"], "DE")
        with self.assertRaises(ValueError):
            import_hf.convert_row(aya, {}, {"converter": "nope"})

    def test_helpsteer_rows_become_judging_tasks(self):
        source = {"id": "hf-helpsteer", "license": "CC-BY-4.0", "family": ["judge"]}
        row = {"prompt": "What is 2+2?", "response": "4", "helpfulness": 4, "correctness": 4, "coherence": 4, "complexity": 0, "verbosity": 1}
        item, reason = import_hf.convert_helpsteer(source, row, {})
        self.assertIsNone(reason)
        self.assertEqual(item["family"], "judge")
        self.assertEqual(item["verified"], "human")
        self.assertIn("4/4", item["messages"][-1]["content"])
        self.assertIn(row["response"], item["messages"][0]["content"])
        self.assertEqual(import_hf.convert_helpsteer(source, {**row, "correctness": None}, {})[1], "no_score")

    def test_more_row_filters(self):
        row = {"source": "Aya-Turkish", "prompt": "Hi<extra_id_1>Assistant", "answer_1": " 42", "answer_2": "42", "answer_3": "41"}
        self.assertTrue(import_hf.passes(row, [{"field": "source", "matches": "(?i)^aya"}]))
        self.assertFalse(import_hf.passes(row, [{"field": "source", "notMatches": "Turkish$"}]))
        self.assertFalse(import_hf.passes(row, [{"field": "prompt", "notContains": "<extra_id_1>"}]))
        self.assertTrue(import_hf.passes(row, [{"field": "prompt", "contains": "Hi"}]))
        self.assertTrue(import_hf.passes(row, [{"field": "answer_1", "equalsField": "answer_2"}]), "compared after trimming")
        self.assertFalse(import_hf.passes(row, [{"field": "answer_1", "equalsField": "answer_3"}]))
        self.assertFalse(import_hf.passes(row, [{"field": "missing", "equalsField": "answer_2"}]))

    def test_template_converter(self):
        source = {"id": "hf-sql", "license": "MIT", "family": ["code-solve"], "hf": {
            "converter": "template", "idField": "id",
            "templates": {
                "EN": {"user": "Schema:\n{db.schema}\n\nQuestion: {question}", "assistant": "```sql\n{query}\n```"},
                "TR": {"user": "Şema:\n{db.schema}\n\nSoru: {question}", "assistant": "```sql\n{query}\n```", "system": "Kısa yanıt ver."},
            },
            "templateShares": {"EN": 1, "TR": 1},
        }}
        spec = import_hf.spec_of(source)
        langs = set()
        for index in range(40):
            row = {"id": f"r{index}", "db": {"schema": "CREATE TABLE t(a INT);"}, "question": "How many rows?", "query": "SELECT COUNT(*) FROM t;"}
            item, reason = import_hf.convert_row(source, row, spec)
            self.assertIsNone(reason)
            self.assertEqual(item, import_hf.convert_row(source, row, spec)[0], "the same row always gets the same language")
            langs.add(item["lang"])
            self.assertTrue(item["messages"][-1]["content"].startswith("```sql"))
            if item["lang"] == "TR":
                self.assertEqual(item["messages"][0], {"role": "system", "content": "Kısa yanıt ver."})
        self.assertEqual(langs, {"EN", "TR"})
        self.assertEqual(import_hf.convert_row(source, {"id": "x", "db": {"schema": "s"}, "question": "", "query": "q"}, spec), (None, "shape"))
        self.assertEqual(import_hf.render("Choices: {choices.text}", {"choices": {"text": ["water", "salt"]}}), "Choices: water, salt")

    def test_verified_generation_keeps_the_shortest_checked_answer(self):
        source = {"id": "hf-math", "license": "Apache-2.0", "family": ["math-reasoning"], "hf": {"converter": "verified-generation", "fields": {"user": "problem", "generations": "generations", "checks": ["math_ok", "complete"], "id": "uuid"}}}
        spec = import_hf.spec_of(source)
        row = {"uuid": "u1", "problem": "1+1?", "generations": ["<think>long long</think>\n2", "<think>x</think>\n3", "<think>ok</think>\n2"], "math_ok": [True, False, True], "complete": [True, True, True]}
        item, reason = import_hf.convert_row(source, row, spec)
        self.assertIsNone(reason)
        self.assertEqual(item["messages"][-1]["content"], "<think>ok</think>\n2")
        self.assertEqual(item["verified"], "upstream-ci")
        self.assertEqual(item["id"], "hf-math:u1")
        self.assertEqual(import_hf.convert_row(source, {**row, "math_ok": [False, False, False]}, spec), (None, "unverified"))
        self.assertEqual(import_hf.convert_row(source, {**row, "complete": [True]}, spec)[0]["messages"][-1]["content"], "<think>long long</think>\n2", "a missing check fails that answer")

    def test_cvss_rows_become_severity_questions(self):
        source = {"id": "hf-cvss", "license": "CC-BY-4.0", "family": ["security"]}
        description = "A SQL injection in the login form of Example CMS 1.2 lets remote attackers read the user table."
        cases = [({"cvss_v3_1": 9.8}, ("Critical", "Kritik")), ({"cvss_v3_1": None, "cvss_v3_0": 7.5}, ("High", "Yüksek")), ({"cvss_v4_0": 5.3}, ("Medium", "Orta")), ({"cvss_v3_1": 3.1}, ("Low", "Düşük"))]
        for scores, names in cases:
            item, reason = import_hf.convert_cvss(source, {"id": "CVE-1", "description": description, **scores}, {})
            self.assertIsNone(reason)
            self.assertIn(names[0] if item["lang"] == "EN" else names[1], item["messages"][-1]["content"])
            self.assertEqual((item["family"], item["verified"]), ("security", "knowledge"))
        self.assertEqual(import_hf.convert_cvss(source, {"id": "CVE-2", "description": description, "cvss_v3_1": None}, {})[1], "no_score")
        self.assertEqual(import_hf.convert_cvss(source, {"id": "CVE-3", "description": "short", "cvss_v3_1": 5.0}, {})[1], "shape")
        langs = {import_hf.convert_cvss(source, {"id": f"CVE-{index}", "description": description, "cvss_v3_1": 5.0}, {})[0]["lang"] for index in range(30)}
        self.assertEqual(langs, {"EN", "TR"})

    def test_helpsteer3_preferences_keep_an_agreeing_reason(self):
        source = {"id": "hf-hs3", "license": "CC-BY-4.0", "family": ["judge"]}
        row = {
            "context": [{"role": "user", "content": "Fix the bug."}],
            "response1": "Here is the full fixed code.", "response2": "Change one line.",
            "overall_preference": -2,
            "individual_preference": [{"score": 1, "reasoning": "@Response 2 is shorter."}, {"score": -2, "reasoning": "@Response 1 is better because it is complete."}],
        }
        item, reason = import_hf.convert_helpsteer3(source, row, {})
        self.assertIsNone(reason)
        answer = item["messages"][-1]["content"]
        self.assertTrue(answer.startswith("**Verdict:** Response 1 is better than Response 2."))
        self.assertIn("Response 1 is better because it is complete.", answer)
        self.assertNotIn("@Response", answer)
        self.assertIn("### Response 2\nChange one line.", item["messages"][0]["content"])
        self.assertEqual((item["family"], item["verified"], item["lang"]), ("judge", "human", "EN"))
        disagreeing = {**row, "individual_preference": [{"score": 2, "reasoning": "Shorter."}]}
        self.assertEqual(import_hf.convert_helpsteer3(source, disagreeing, {})[1], "no_reason")
        self.assertEqual(import_hf.convert_helpsteer3(source, {**row, "overall_preference": 7}, {})[1], "shape")

    def test_row_options(self):
        source = {"id": "hf-bash", "license": "MIT", "family": ["code-solve"], "hf": {"converter": "messages", "dropSystem": True, "wrapAnswer": "```bash\n{answer}\n```", "minUserChars": 10}}
        spec = import_hf.spec_of(source)
        row = {"messages": [{"role": "system", "content": "You are a Bash expert."}, {"role": "user", "content": "Show the last 20 lines of error.log."}, {"role": "assistant", "content": "tail -n 20 error.log"}]}
        item, reason = import_hf.convert_row(source, row, spec)
        self.assertIsNone(reason)
        self.assertEqual([message["role"] for message in item["messages"]], ["user", "assistant"])
        self.assertEqual(item["messages"][-1]["content"], "```bash\ntail -n 20 error.log\n```")
        short = {"messages": [{"role": "user", "content": "-"}, {"role": "assistant", "content": "ls"}]}
        self.assertEqual(import_hf.convert_row(source, short, spec), (None, "short_prompt"))
        blank_system = import_hf.normalize_messages([{"role": "system", "content": " "}, {"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello"}])
        self.assertEqual([message["role"] for message in blank_system], ["user", "assistant"])

    def test_looping_generations_are_dropped(self):
        self.assertTrue(import_hf.repetitive("Also müssen wir " + "ZUWEILS " * 40))
        self.assertTrue(import_hf.repetitive("Let me think. " * 400), "a long loop compresses like one")
        self.assertFalse(import_hf.repetitive("x = [0, 0, 0, 0] " * 10 + "The values 1, 2, 3 repeat."))
        schema = "\n".join(f"CREATE TABLE t{index} (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, price DECIMAL(10,2));" for index in range(80))
        self.assertFalse(import_hf.repetitive(schema), "repeated schema lines aren't a loop")
        source = {"id": "hf-loop", "license": "MIT", "family": ["chat"], "hf": {"converter": "messages"}}
        row = {"messages": [{"role": "user", "content": "Finden Sie f."}, {"role": "assistant", "content": "<think>" + "ZUWEILS " * 50 + "</think> f(n) = n"}]}
        self.assertEqual(import_hf.convert_row(source, row, import_hf.spec_of(source)), (None, "repetitive"))

    def test_repeats_are_found_by_field_or_prompt(self):
        item = {"messages": [{"role": "user", "content": " Solve x+1=2 "}, {"role": "assistant", "content": "x=1"}]}
        self.assertIsNone(import_hf.unique_key({}, item, {}))
        self.assertEqual(import_hf.unique_key({}, item, {"uniqueBy": "$prompt"}), import_hf.unique_key({}, {"messages": [{"role": "user", "content": "Solve x+1=2"}]}, {"uniqueBy": "$prompt"}))
        self.assertEqual(import_hf.unique_key({"group": "g1"}, item, {"uniqueBy": "group"}), import_hf.digest("g1"))
        self.assertIsNone(import_hf.unique_key({}, item, {"uniqueBy": "group"}))

    def test_import_reads_configs_in_turn_without_repeats(self):
        rows = {
            "a": [{"group": f"g{index // 2}", "question": f"Question {index} about A?", "answer": f"Answer {index}"} for index in range(40)],
            "b": [{"group": f"h{index}", "question": f"Question {index} about B?", "answer": f"Answer {index}"} for index in range(40)],
        }
        calls = []

        class Stream(list):
            def shuffle(self, seed=None, buffer_size=None):
                return self

        def load_dataset(repo, config=None, split=None, streaming=False, **options):
            calls.append((repo, config, split, options.get("data_files")))
            return Stream(rows.get(config, rows["a"]))

        class HfApi:
            def __init__(self, token=None):
                pass

            def dataset_info(self, repo):
                raise RuntimeError("offline")

        fake = {"datasets": types.SimpleNamespace(load_dataset=load_dataset), "huggingface_hub": types.SimpleNamespace(HfApi=HfApi)}
        source = {"id": "hf-two", "repo": "x/two", "license": "MIT", "family": ["chat"], "cap": 10, "hf": {"converter": "fields", "fields": {"user": "question", "assistant": "answer"}, "configs": ["a", "b"], "uniqueBy": "group"}}
        with tempfile.TemporaryDirectory() as folder, mock.patch.dict(sys.modules, fake):
            stats = import_hf.import_source(source, folder)
            with open(os.path.join(folder, "hf-two.jsonl"), encoding="utf-8") as handle:
                lines = [json.loads(line) for line in handle]
            self.assertEqual(stats["kept"], 10)
            self.assertEqual(sum("about A" in line["messages"][0]["content"] for line in lines), 5, "each config gets its share")
            self.assertEqual(stats["skipped"].get("repeat"), 4, "one sample per group")
            self.assertIsNone(stats["revision"])
            self.assertEqual([call[1] for call in calls], ["a", "b"])
            # Files read directly (no loading script).
            calls.clear()
            direct = {**source, "id": "hf-files", "hf": {**source["hf"], "configs": None, "format": "json", "dataFiles": ["data/train.jsonl"], "revision": "abc"}}
            import_hf.import_source(direct, folder)
            self.assertEqual(calls[0][0], "json")
            self.assertEqual(calls[0][3], {"train": ["hf://datasets/x/two@abc/data/train.jsonl"]})

    def test_tool_use_conversations_keep_calls_results_and_definitions(self):
        tools = [{"type": "function", "function": {"name": "get_bitcoin_balance", "parameters": {"type": "object", "properties": {"address": {"type": "string"}}}}}]
        # Nemotron-Agentic-v1: arguments and tool results as objects, tools at the top level.
        agentic = {"uuid": "u1", "tools": tools, "messages": [
            {"role": "system", "content": ""},
            {"role": "user", "content": "Check the balance of 1A1zP1."},
            {"role": "assistant", "content": "", "reasoning_content": "Use the balance tool.", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "get_bitcoin_balance", "arguments": {"address": "1A1zP1"}}}]},
            {"role": "tool", "content": {"balance": "0.5"}},
            {"role": "assistant", "content": "The balance is 0.5 BTC.", "tool_calls": None, "reasoning_content": "Report it."},
        ]}
        source = {"id": "hf-tools", "license": "CC-BY-4.0", "family": ["tool-use"], "hf": {"converter": "tools", "lang": "EN"}}
        item, reason = import_hf.convert_row(source, agentic, import_hf.spec_of(source))
        self.assertIsNone(reason)
        self.assertEqual([message["role"] for message in item["messages"]], ["user", "assistant", "tool", "assistant"])
        self.assertEqual(item["messages"][1]["tool_calls"][0]["function"], {"name": "get_bitcoin_balance", "arguments": {"address": "1A1zP1"}})
        self.assertEqual(json.loads(item["messages"][2]["content"]), {"balance": "0.5"})
        self.assertEqual((item["family"], item["tools"]), ("tool-use", tools))
        # Nemotron v1: arguments as JSON strings, tools inside the metadata JSON string.
        nemotron = {"uuid": "u2", "metadata": json.dumps({"tools": tools}), "messages": [
            {"role": "user", "content": "Balance of 1A1zP1?", "tool_calls": []},
            {"role": "assistant", "content": "<think>\nCall it.\n</think>", "tool_calls": [{"id": "c2", "type": "function", "function": {"name": "get_bitcoin_balance", "arguments": "{\"address\": \"1A1zP1\"}"}}]},
            {"role": "tool", "content": "{\"balance\": 0.5}", "tool_calls": []},
            {"role": "assistant", "content": "It holds 0.5 BTC.", "tool_calls": []},
        ]}
        source_v1 = {"id": "hf-tools-v1", "license": "CC-BY-4.0", "family": ["tool-use"], "hf": {"converter": "tools", "toolsField": "metadata.tools", "lang": "EN"}}
        item, reason = import_hf.convert_row(source_v1, nemotron, import_hf.spec_of(source_v1))
        self.assertIsNone(reason)
        self.assertEqual(item["messages"][1]["tool_calls"][0]["function"]["arguments"], {"address": "1A1zP1"})
        self.assertEqual(item["tools"], tools)
        # No tool definitions, a call with broken arguments, or no call at all: not a tool-use sample.
        self.assertEqual(import_hf.convert_row(source_v1, {**nemotron, "metadata": "{}"}, import_hf.spec_of(source_v1)), (None, "no_tools"))
        broken = json.loads(json.dumps(nemotron))
        broken["messages"][1]["tool_calls"][0]["function"]["arguments"] = "{not json"
        self.assertEqual(import_hf.convert_row(source_v1, broken, import_hf.spec_of(source_v1)), (None, "shape"))
        # Tool definitions count toward the size limit.
        small = {"id": "hf-tools-small", "license": "CC-BY-4.0", "family": ["tool-use"], "hf": {"converter": "tools", "lang": "EN", "maxChars": 300}}
        self.assertEqual(import_hf.convert_row(small, {**agentic, "tools": tools * 5}, import_hf.spec_of(small)), (None, "too_long"))
        # Without keep_tools, tool turns still make a conversation unusable for the other converters.
        self.assertIsNone(import_hf.normalize_messages(agentic["messages"]))

    def test_json_lines_reader_reads_the_files_line_by_line(self):
        lines = [b'{"a": 1}\n', b"\n", b'{"a": {"nested": true}}\n']

        class File:
            def __init__(self, *_args, **_kwargs):
                pass

            def __enter__(self):
                return iter(lines)

            def __exit__(self, *_args):
                return False

        class FileSystem:
            opened = []

            def __init__(self, token=None):
                pass

            def open(self, path, mode, block_size=None):
                FileSystem.opened.append(path)
                return File()

        with mock.patch.dict(sys.modules, {"huggingface_hub": types.SimpleNamespace(HfFileSystem=FileSystem)}):
            rows = list(import_hf.jsonl_rows("nvidia/x", ["data/a.jsonl"], revision="abc"))
        self.assertEqual(rows, [{"a": 1}, {"a": {"nested": True}}])
        self.assertEqual(FileSystem.opened, ["datasets/nvidia/x@abc/data/a.jsonl"])

    def test_source_selection_respects_status(self):
        registry = {"sources": [
            {"id": "a", "kind": "hf", "status": "allowed"},
            {"id": "b", "kind": "hf", "status": "review"},
            {"id": "c", "kind": "hf", "status": "excluded"},
            {"id": "d", "kind": "github", "status": "allowed"},
            {"id": "e", "kind": "hf", "status": "review", "cap": 0},
        ]}
        self.assertEqual([s["id"] for s in import_hf.selected_sources(registry)], ["a"])
        self.assertEqual([s["id"] for s in import_hf.selected_sources(registry, include_review=True)], ["a", "b"])
        self.assertEqual([s["id"] for s in import_hf.selected_sources(registry, only=["c"], include_review=True)], [])


if __name__ == "__main__":
    unittest.main()
