"""Imports the Hugging Face sources of training/sources.json as training samples.

Only sources whose status is "allowed" are read; "review" sources need
--include-review (after their dataset card's provenance has been checked and
written into sources.json), and "excluded" sources are never read. Each row
becomes one sample in the schema of training/lib/common.mjs; training/mix.mjs
then detects languages, filters, removes duplicates and mixes everything.

    pip install datasets huggingface_hub
    HF_TOKEN=... python3 training/import_hf.py [--only hf-oasst2,hf-aya-dataset] [--include-review] [--limit 1000]

Writes training/data/hf/<source id>.jsonl and training/data/hf/manifest.json.
The converters are plain functions over rows, so they are tested without
network access (training/tests/test_import_hf.py).
"""
import argparse
import hashlib
import json
import os
import random
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ROLE_NAMES = {"user": "user", "human": "user", "prompter": "user", "question": "user", "assistant": "assistant", "gpt": "assistant", "bot": "assistant", "model": "assistant", "system": "system"}
REASONING_KEYS = ("reasoning_content", "reasoning", "thinking", "thought", "think")


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def text_of(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):  # content parts
        return "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in value)
    return str(value)


def normalize_messages(raw):
    """Messages in role/content form, or None when the conversation can't be used (tool turns, bad roles)."""
    messages = []
    for item in raw or []:
        if not isinstance(item, dict):
            return None
        role = ROLE_NAMES.get(str(item.get("role", item.get("from", ""))).lower())
        if role is None:
            return None
        content = text_of(item.get("content", item.get("value")))
        message = {"role": role, "content": content}
        for key in REASONING_KEYS:
            reasoning = item.get(key)
            if isinstance(reasoning, str) and reasoning.strip():
                message["reasoning_content"] = reasoning
                break
        if item.get("tool_calls"):
            return None
        messages.append(message)
    if len(messages) < 2 or messages[-1]["role"] != "assistant":
        return None
    if not any(message["role"] == "user" and message["content"].strip() for message in messages):
        return None
    return messages


def generic_messages(row):
    """Finds the conversation in a row of the common dataset layouts."""
    for key in ("messages", "conversations", "conversation", "dialog", "chat"):
        if isinstance(row.get(key), list):
            messages = normalize_messages(row[key])
            if messages and isinstance(row.get("system"), str) and row["system"].strip() and messages[0]["role"] != "system":
                messages.insert(0, {"role": "system", "content": row["system"]})
            return messages
    if isinstance(row.get("user"), str) and isinstance(row.get("assistant"), str):
        messages = [{"role": "user", "content": row["user"]}, {"role": "assistant", "content": row["assistant"]}]
        if isinstance(row.get("system"), str) and row["system"].strip():
            messages.insert(0, {"role": "system", "content": row["system"]})
    elif isinstance(row.get("instruction"), str) and isinstance(row.get("output", row.get("response")), str):
        extra = row.get("input") or ""
        prompt = row["instruction"] if not extra.strip() else f"{row['instruction']}\n\n{extra}"
        messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": row.get("output", row.get("response"))}]
    else:
        for question, answer in (("prompt", "response"), ("prompt", "completion"), ("question", "answer"), ("query", "response"), ("input", "output"), ("inputs", "targets")):
            if isinstance(row.get(question), str) and isinstance(row.get(answer), str):
                messages = [{"role": "user", "content": row[question]}, {"role": "assistant", "content": row[answer]}]
                break
        else:
            return None
    for key in REASONING_KEYS:
        if isinstance(row.get(key), str) and row[key].strip():
            messages[-1]["reasoning_content"] = row[key]
            break
    return normalize_messages(messages)


def sample(source, key, messages, lang=None, family=None, verified="none"):
    return {
        "id": f"{source['id']}:{key}",
        "group": f"{source['id']}:{key}",
        "source": source["id"],
        "license": source["license"],
        "lang": lang,
        "family": family or (source["family"][0] if source.get("family") else "chat"),
        "verified": verified,
        "messages": messages,
    }


# ---------------------------------------------------------------- per-source converters

AYA_LANGUAGES = {"tur": "TR", "eng": "EN"}


def convert_aya(source, row):
    lang = AYA_LANGUAGES.get(row.get("language_code"))
    if not lang or not isinstance(row.get("inputs"), str) or not isinstance(row.get("targets"), str):
        return None, "language"
    messages = normalize_messages([{"role": "user", "content": row["inputs"]}, {"role": "assistant", "content": row["targets"]}])
    if not messages:
        return None, "shape"
    return sample(source, digest(row["inputs"] + row["targets"]), messages, lang=lang, family="chat", verified="human"), None


def oasst_threads(rows, languages=("tr", "en")):
    """The best-ranked thread of every OpenAssistant tree: from the prompt, always the reply with the lowest rank."""
    by_parent = {}
    roots = []
    for row in rows:
        if row.get("deleted") or row.get("review_result") is False or row.get("synthetic"):
            continue
        if row.get("parent_id") is None:
            if row.get("lang") in languages and row.get("role") == "prompter":
                roots.append(row)
        else:
            by_parent.setdefault(row["parent_id"], []).append(row)

    def best(children, role):
        options = [child for child in children if child.get("role") == role and (child.get("text") or "").strip()]
        if not options:
            return None
        return sorted(options, key=lambda child: (child.get("rank") if child.get("rank") is not None else 99, -len(by_parent.get(child["message_id"], []))))[0]

    for root in roots:
        thread = [root]
        node = root
        while True:
            want = "assistant" if node["role"] == "prompter" else "prompter"
            child = best(by_parent.get(node["message_id"], []), want)
            if child is None:
                break
            thread.append(child)
            node = child
        while thread and thread[-1]["role"] != "assistant":
            thread.pop()
        if len(thread) >= 2:
            yield root, thread


def convert_oasst_thread(source, root, thread):
    messages = normalize_messages([{"role": "user" if item["role"] == "prompter" else "assistant", "content": item["text"]} for item in thread])
    if not messages:
        return None
    return sample(source, root["message_tree_id"], messages, lang="TR" if root.get("lang") == "tr" else "EN", family="chat", verified="human")


def convert_self_oss(source, row):
    if not isinstance(row.get("instruction"), str) or not isinstance(row.get("response"), str):
        return None, "shape"
    messages = normalize_messages([{"role": "user", "content": row["instruction"]}, {"role": "assistant", "content": row["response"]}])
    return (sample(source, digest(row["instruction"]), messages, lang="EN", family="code-solve", verified="upstream-ci"), None) if messages else (None, "shape")


def convert_opencodeinstruct(source, row):
    try:
        score = float(row.get("average_test_score"))
    except (TypeError, ValueError):
        return None, "no_score"
    if score < 0.9:
        return None, "low_score"
    if not isinstance(row.get("input"), str) or not isinstance(row.get("output"), str):
        return None, "shape"
    messages = normalize_messages([{"role": "user", "content": row["input"]}, {"role": "assistant", "content": row["output"]}])
    return (sample(source, str(row.get("id") or digest(row["input"])), messages, lang="EN", family="code-solve", verified="upstream-ci"), None) if messages else (None, "shape")


def convert_openthoughts(source, row):
    messages = generic_messages(row)
    if not messages:
        return None, "shape"
    if sum(len(message["content"]) for message in messages) > 16000:
        return None, "too_long"
    if "<|begin_of_thought|>" not in messages[-1]["content"]:
        return None, "no_thought"
    # The dataset's long system prompt asks for its own format; the thinking itself is what we keep.
    messages = [message for message in messages if message["role"] != "system"]
    return sample(source, digest(messages[0]["content"]), messages, lang="EN", family="chat-reasoning", verified="upstream-ci"), None


def convert_generic(source, row):
    messages = generic_messages(row)
    if not messages:
        return None, "shape"
    key = str(row.get("id") or digest(json.dumps(messages, ensure_ascii=False)))
    family = "chat-reasoning" if messages[-1].get("reasoning_content") or "<think>" in messages[-1]["content"] else None
    return sample(source, key, messages, family=family), None


CONVERTERS = {
    "hf-aya-dataset": convert_aya,
    "hf-self-oss-instruct": convert_self_oss,
    "hf-opencodeinstruct": convert_opencodeinstruct,
    "hf-openthoughts-114k": convert_openthoughts,
}
LOADERS = {
    # (config, split, keep probability while streaming)
    "hf-aya-dataset": (None, "train", 1.0),
    "hf-oasst2": (None, "train", 1.0),
    "hf-self-oss-instruct": (None, "train", 1.0),
    "hf-opencodeinstruct": (None, "train", 0.25),
    "hf-openthoughts-114k": (None, "train", 1.0),
}


def import_source(source, out_dir, limit=None, seed=20261005):
    from datasets import load_dataset  # imported here so the converters work without the package

    config, split, keep = LOADERS.get(source["id"], (None, "train", 1.0))
    cap = limit or source.get("cap") or None
    rng = random.Random(f"{seed}:{source['id']}")
    stats = {"rows": 0, "kept": 0, "skipped": {}}
    started = time.time()
    path = os.path.join(out_dir, f"{source['id']}.jsonl")
    token = os.environ.get("HF_TOKEN") or None
    with open(path, "w", encoding="utf-8") as handle:
        if source["id"] == "hf-oasst2":
            rows = list(load_dataset(source["repo"], split=split, token=token))
            stats["rows"] = len(rows)
            for root, thread in oasst_threads(rows):
                item = convert_oasst_thread(source, root, thread)
                if item:
                    handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                    stats["kept"] += 1
                    if cap and stats["kept"] >= cap:
                        break
        else:
            convert = CONVERTERS.get(source["id"], convert_generic)
            stream = load_dataset(source["repo"], config, split=split, streaming=True, token=token)
            for row in stream:
                stats["rows"] += 1
                if keep < 1.0 and rng.random() > keep:
                    continue
                item, reason = convert(source, row)
                if item is None:
                    stats["skipped"][reason] = stats["skipped"].get(reason, 0) + 1
                    continue
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                stats["kept"] += 1
                if cap and stats["kept"] >= cap:
                    break
    stats["seconds"] = round(time.time() - started, 1)
    try:
        from huggingface_hub import HfApi

        stats["revision"] = HfApi(token=token).dataset_info(source["repo"]).sha
    except Exception as error:  # noqa: BLE001 - the revision is informative only
        stats["revision"] = None
        stats["revisionError"] = str(error)[:200]
    return stats


def selected_sources(registry, only=None, include_review=False):
    wanted = set(only) if only else None
    chosen = []
    for source in registry["sources"]:
        if source.get("kind") != "hf" or (wanted and source["id"] not in wanted):
            continue
        if source["status"] == "allowed" or (include_review and source["status"] == "review"):
            chosen.append(source)
    return chosen


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--only", help="comma-separated source ids")
    parser.add_argument("--include-review", action="store_true", help="also import sources whose status is 'review'")
    parser.add_argument("--limit", type=int, help="at most this many samples per source (overrides the registry's cap)")
    parser.add_argument("--out", default=os.path.join(ROOT, "training", "data", "hf"))
    args = parser.parse_args(argv)
    with open(os.path.join(ROOT, "training", "sources.json"), encoding="utf-8") as handle:
        registry = json.load(handle)
    sources = selected_sources(registry, args.only.split(",") if args.only else None, args.include_review)
    if not sources:
        print("no source selected", file=sys.stderr)
        return 1
    os.makedirs(args.out, exist_ok=True)
    manifest_path = os.path.join(args.out, "manifest.json")
    manifest = {"sources": {}}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as handle:
            manifest = json.load(handle)
    for source in sources:
        print(f"→ {source['id']} ({source['repo']})", flush=True)
        try:
            stats = import_source(source, args.out, args.limit)
        except Exception as error:  # noqa: BLE001 - reported per source, the others still run
            stats = {"error": str(error)[:500]}
            print(f"  ✗ {stats['error']}", flush=True)
        else:
            print(f"  ✓ {stats['kept']} samples from {stats['rows']} rows", flush=True)
        manifest["sources"][source["id"]] = {"repo": source["repo"], "license": source["license"], "status": source["status"], **stats}
    manifest["built"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
