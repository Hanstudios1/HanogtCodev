"""Converters of training/import_hf.py, on hand-made rows (no network).

    python3 -m unittest discover -s training/tests
"""
import os
import sys
import unittest

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

    def test_source_selection_respects_status(self):
        registry = {"sources": [
            {"id": "a", "kind": "hf", "status": "allowed"},
            {"id": "b", "kind": "hf", "status": "review"},
            {"id": "c", "kind": "hf", "status": "excluded"},
            {"id": "d", "kind": "github", "status": "allowed"},
        ]}
        self.assertEqual([s["id"] for s in import_hf.selected_sources(registry)], ["a"])
        self.assertEqual([s["id"] for s in import_hf.selected_sources(registry, include_review=True)], ["a", "b"])
        self.assertEqual([s["id"] for s in import_hf.selected_sources(registry, only=["c"], include_review=True)], [])


if __name__ == "__main__":
    unittest.main()
