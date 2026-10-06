"""Imports the Hugging Face sources of training/sources.json as training samples.

Only sources whose status is "allowed" are read; "review" sources need
--include-review (after their dataset card's provenance has been checked and
written into sources.json), and "excluded" sources are never read. Each row
becomes one sample in the schema of training/lib/common.mjs; training/mix.mjs
then detects languages, filters, removes duplicates and mixes everything.

How a source is read is written in its registry entry ("hf"), so a new
dataset usually needs a registry entry and no code:

    "hf": {
      "config": null, "split": "train", "keep": 1.0,      # dataset config (or "configs": [...] read in turn), split, share of rows kept
      "converter": "messages",                          # messages | fields | template | verified-generation | cvss | helpsteer | helpsteer3 | aya | oasst | …
      "fields": {"user": "question", "assistant": "answer", "reasoning": "thinking"},   # for "fields"
      "where": [{"field": "language", "in": ["tr"]}],   # row filters: equals, in, notIn, min, max, truthy, matches, notContains, equalsField
      "lang": "TR",                                     # or "langField" + "langMap" ({"tur": "TR"})
      "family": "science", "verified": "human", "maxChars": 12000, "maxScan": 400000,
      "uniqueBy": "problem_id",                         # one sample per value ("$prompt": per first user message)
      "dropSystem": true, "wrapAnswer": "```bash\n{answer}\n```", "minUserChars": 20,
      "importCap": 60000,                               # rows kept here when the mix's "cap" applies after language filtering
      "format": "json", "dataFiles": ["data/train.jsonl"]   # read files of the repo directly (no loading script)
    }

    pip install datasets huggingface_hub
    HF_TOKEN=... python3 training/import_hf.py [--only hf-oasst2,hf-aya-dataset] [--include-review] [--limit 1000]

Writes training/data/hf/<source id>.jsonl and training/data/hf/manifest.json.
The converters are plain functions over rows, so they are tested without
network access (training/tests/test_import_hf.py).
"""
import argparse
import hashlib
import json
import math
import os
import random
import re
import sys
import time
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ROLE_NAMES = {"user": "user", "human": "user", "prompter": "user", "question": "user", "assistant": "assistant", "gpt": "assistant", "bot": "assistant", "model": "assistant", "system": "system"}
REASONING_KEYS = ("reasoning_content", "reasoning", "thinking", "thought", "think")


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def unit(text):
    """A number in [0, 1) that only depends on the text."""
    return int(digest(text), 16) / float(16 ** 16)


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
        if role == "system" and not content.strip():
            continue
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


def convert_aya(source, row, spec=None):
    languages = (spec or {}).get("langMap") or AYA_LANGUAGES
    lang = languages.get(row.get("language_code")) or languages.get(row.get("language"))
    if not lang or not isinstance(row.get("inputs"), str) or not isinstance(row.get("targets"), str):
        return None, "language"
    messages = normalize_messages([{"role": "user", "content": row["inputs"]}, {"role": "assistant", "content": row["targets"]}])
    if not messages:
        return None, "shape"
    return sample(source, digest(row["inputs"] + row["targets"]), messages, lang=lang, family=(spec or {}).get("family") or "chat", verified="human"), None


OASST_LANGUAGES = {"tr": "TR", "en": "EN"}


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


def convert_oasst_thread(source, root, thread, languages=None):
    messages = normalize_messages([{"role": "user" if item["role"] == "prompter" else "assistant", "content": item["text"]} for item in thread])
    if not messages:
        return None
    lang = (languages or {**OASST_LANGUAGES, "de": "DE", "az": "AZ"}).get(root.get("lang"))
    return sample(source, root["message_tree_id"], messages, lang=lang, family="chat", verified="human")


def convert_self_oss(source, row, spec=None):
    if not isinstance(row.get("instruction"), str) or not isinstance(row.get("response"), str):
        return None, "shape"
    messages = normalize_messages([{"role": "user", "content": row["instruction"]}, {"role": "assistant", "content": row["response"]}])
    return (sample(source, digest(row["instruction"]), messages, lang="EN", family="code-solve", verified="upstream-ci"), None) if messages else (None, "shape")


def convert_opencodeinstruct(source, row, spec=None):
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


def convert_openthoughts(source, row, spec=None):
    messages = generic_messages(row)
    if not messages:
        return None, "shape"
    if sum(len(message["content"]) for message in messages) > (spec or {}).get("maxChars", 16000):
        return None, "too_long"
    if "<|begin_of_thought|>" not in messages[-1]["content"]:
        return None, "no_thought"
    # The dataset's long system prompt asks for its own format; the thinking itself is what we keep.
    messages = [message for message in messages if message["role"] != "system"]
    return sample(source, digest(messages[0]["content"]), messages, lang="EN", family=(spec or {}).get("family") or "chat-reasoning", verified="upstream-ci"), None


def convert_generic(source, row, spec=None):
    messages = generic_messages(row)
    if not messages:
        return None, "shape"
    key = str(row.get("id") or digest(json.dumps(messages, ensure_ascii=False)))
    family = "chat-reasoning" if messages[-1].get("reasoning_content") or "<think>" in messages[-1]["content"] else None
    return sample(source, key, messages, family=family), None


# ---------------------------------------------------------------- registry-driven reading

def field(row, path):
    """A row's value by a dotted path ("meta.language"); None when it isn't there."""
    value = row
    for part in str(path).split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            return None
    return value


def passes(row, conditions):
    """Whether a row meets every "where" condition of the registry entry."""
    for condition in conditions or []:
        value = field(row, condition["field"])
        if "equals" in condition and value != condition["equals"]:
            return False
        if "in" in condition and value not in condition["in"]:
            return False
        if "notIn" in condition and value in condition["notIn"]:
            return False
        if "min" in condition or "max" in condition:
            try:
                number = float(value)
            except (TypeError, ValueError):
                return False
            if "min" in condition and number < condition["min"]:
                return False
            if "max" in condition and number > condition["max"]:
                return False
        if condition.get("truthy") and not value:
            return False
        if "matches" in condition and not re.search(condition["matches"], text_of(value)):
            return False
        if "notMatches" in condition and re.search(condition["notMatches"], text_of(value)):
            return False
        if "contains" in condition and condition["contains"] not in text_of(value):
            return False
        if "notContains" in condition and condition["notContains"] in text_of(value):
            return False
        if "equalsField" in condition and (value is None or str(value).strip() != str(field(row, condition["equalsField"])).strip()):
            return False
    return True


def language_of(row, spec):
    """The sample's language from the registry entry: fixed, mapped from a field, or None (mix.mjs detects it)."""
    if spec.get("lang"):
        return spec["lang"]
    if spec.get("langField"):
        value = field(row, spec["langField"])
        mapping = spec.get("langMap") or {}
        return mapping.get(value) if mapping else (value.upper() if isinstance(value, str) else None)
    return None


def convert_fields(source, row, spec):
    """A question/answer row: spec["fields"] names the user, assistant and optional reasoning and system fields."""
    names = spec.get("fields") or {}
    users = names.get("user")
    users = users if isinstance(users, list) else [users]
    parts = [text_of(field(row, name)).strip() for name in users if name]
    question = "\n\n".join(part for part in parts if part)
    answer = text_of(field(row, names.get("assistant", "answer"))).strip()
    if not question or not answer:
        return None, "shape"
    messages = [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    if names.get("system") and text_of(field(row, names["system"])).strip():
        messages.insert(0, {"role": "system", "content": text_of(field(row, names["system"])).strip()})
    if names.get("reasoning"):
        reasoning = text_of(field(row, names["reasoning"])).strip()
        if reasoning:
            messages[-1]["reasoning_content"] = reasoning
    messages = normalize_messages(messages)
    if not messages:
        return None, "shape"
    key = str(field(row, names["id"]) if names.get("id") and field(row, names["id"]) is not None else digest(question + answer))
    return sample(source, key, messages), None


def convert_messages(source, row, spec):
    target = spec.get("messagesField")
    messages = generic_messages({"messages": field(row, target)} if target else row)
    if not messages:
        return None, "shape"
    key = str(row.get("id") or row.get("uuid") or digest(json.dumps(messages, ensure_ascii=False)))
    return sample(source, key, messages), None


HELPSTEER_ATTRIBUTES = ("helpfulness", "correctness", "coherence", "complexity", "verbosity")
JUDGE_PROMPTS = {
    "TR": "Aşağıdaki soruya verilen yanıtı değerlendir. Her ölçüte 0 ile 4 arasında puan ver: yardımseverlik, doğruluk, tutarlılık, karmaşıklık, ayrıntı düzeyi.",
    "EN": "Rate the response to the prompt below. Give each attribute a score from 0 to 4: helpfulness, correctness, coherence, complexity, verbosity.",
}
JUDGE_LABELS = {
    "TR": {"helpfulness": "Yardımseverlik", "correctness": "Doğruluk", "coherence": "Tutarlılık", "complexity": "Karmaşıklık", "verbosity": "Ayrıntı düzeyi"},
    "EN": {"helpfulness": "Helpfulness", "correctness": "Correctness", "coherence": "Coherence", "complexity": "Complexity", "verbosity": "Verbosity"},
}


def convert_helpsteer(source, row, spec):
    """A human-rated prompt/response pair as a judging task: the model learns to give the annotators' scores."""
    prompt, response = text_of(row.get("prompt")).strip(), text_of(row.get("response")).strip()
    scores = {}
    for name in HELPSTEER_ATTRIBUTES:
        try:
            scores[name] = int(round(float(row.get(name))))
        except (TypeError, ValueError):
            return None, "no_score"
    if not prompt or not response:
        return None, "shape"
    # Mostly English data: the instruction is English or Turkish, chosen stably per row.
    lang = "TR" if int(digest(prompt + response), 16) % 4 == 0 else "EN"
    labels = JUDGE_LABELS[lang]
    question = f"{JUDGE_PROMPTS[lang]}\n\n### Prompt\n{prompt}\n\n### Response\n{response}"
    answer = "\n".join(f"- {labels[name]}: {scores[name]}/4" for name in HELPSTEER_ATTRIBUTES)
    messages = normalize_messages([{"role": "user", "content": question}, {"role": "assistant", "content": answer}])
    if not messages:
        return None, "shape"
    item = sample(source, digest(prompt + response), messages, lang=lang, family="judge", verified="human")
    item["judgeLanguage"] = lang
    return item, None


PLACEHOLDER = re.compile(r"\{([A-Za-z_][\w.]*)\}")


def render(template, row):
    """The template with each {field} (dotted paths allowed) filled from the row; None when a field is empty."""
    missing = []

    def value(match):
        found = field(row, match.group(1))
        if isinstance(found, (list, tuple)):
            text = ", ".join(text_of(part).strip() for part in found if text_of(part).strip())
        elif isinstance(found, dict):
            text = json.dumps(found, ensure_ascii=False)
        else:
            text = text_of(found).strip()
        if not text:
            missing.append(match.group(1))
        return text

    rendered = PLACEHOLDER.sub(value, template)
    return None if missing else rendered


def row_key(row, spec):
    name = spec.get("idField")
    if name and field(row, name) is not None:
        return str(field(row, name))
    return digest(json.dumps(row, ensure_ascii=False, sort_keys=True, default=str))


def pick_language(spec, key):
    """The template language of a row, stable per row: spec["templateShares"] weighs the languages of spec["templates"]."""
    languages = sorted(spec.get("templates") or {})
    if len(languages) <= 1:
        return languages[0] if languages else None
    shares = spec.get("templateShares") or {}
    total = sum(shares.get(lang, 1) for lang in languages)
    point, reached = unit(f"lang:{key}"), 0.0
    for lang in languages:
        reached += shares.get(lang, 1) / total
        if point < reached:
            return lang
    return languages[-1]


def convert_template(source, row, spec):
    """A row written into a conversation by the registry's templates ({"user", "assistant", "system"?} per language)."""
    key = row_key(row, spec)
    lang = pick_language(spec, key)
    template = spec["templates"][lang] if lang else spec.get("template") or {}
    user, answer = render(template.get("user", ""), row), render(template.get("assistant", ""), row)
    if not user or not answer:
        return None, "shape"
    messages = [{"role": "user", "content": user}, {"role": "assistant", "content": answer}]
    if template.get("system"):
        messages.insert(0, {"role": "system", "content": template["system"]})
    messages = normalize_messages(messages)
    if not messages:
        return None, "shape"
    return sample(source, key, messages, lang=lang or spec.get("lang")), None


def convert_verified_generation(source, row, spec):
    """Several generated answers per row with parallel check lists: the shortest answer that passes every check."""
    names = spec.get("fields") or {}
    question = text_of(field(row, names.get("user", "problem"))).strip()
    generations = field(row, names.get("generations", "generations")) or []
    checks = [field(row, name) or [] for name in names.get("checks", [])]
    passing = [
        text for index, text in enumerate(generations)
        if isinstance(text, str) and text.strip() and all(index < len(check) and check[index] is True for check in checks)
    ]
    if not question or not passing:
        return None, "unverified"
    messages = normalize_messages([{"role": "user", "content": question}, {"role": "assistant", "content": min(passing, key=len)}])
    if not messages:
        return None, "shape"
    key = str(field(row, names["id"])) if names.get("id") and field(row, names["id"]) is not None else digest(question)
    return sample(source, key, messages, verified="upstream-ci"), None


CVSS_SCORES = (("cvss_v3_1", "CVSS v3.1"), ("cvss_v3_0", "CVSS v3.0"), ("cvss_v4_0", "CVSS v4.0"))
SEVERITY = {
    "EN": ("Low", "Medium", "High", "Critical"),
    "TR": ("Düşük", "Orta", "Yüksek", "Kritik"),
}
CVSS_PROMPTS = {
    "EN": "Estimate how severe this vulnerability is from its description. Answer with the CVSS severity (Low, Medium, High or Critical) and the base score.",
    "TR": "Bu güvenlik açığının ne kadar ciddi olduğunu açıklamasından tahmin et. CVSS önem derecesini (Düşük, Orta, Yüksek ya da Kritik) ve temel puanı söyle.",
}
CVSS_ANSWERS = {
    "EN": "**{severity}**: {version} base score {score}.",
    "TR": "**{severity}**: {version} temel puanı {score}.",
}


def convert_cvss(source, row, spec):
    """A published vulnerability as a severity question: description in, the advisory's CVSS band and score out."""
    description = text_of(row.get("description")).strip()
    for name, version in CVSS_SCORES:
        try:
            score = float(row.get(name))
        except (TypeError, ValueError):
            continue
        if 0 < score <= 10:
            break
    else:
        return None, "no_score"
    if len(description) < 40:
        return None, "shape"
    key = str(row.get("id") or digest(description))
    lang = pick_language({"templates": CVSS_PROMPTS, "templateShares": spec.get("templateShares") or {"EN": 0.7, "TR": 0.3}}, key)
    band = 0 if score < 4 else 1 if score < 7 else 2 if score < 9 else 3
    answer = CVSS_ANSWERS[lang].format(severity=SEVERITY[lang][band], version=version, score=f"{score:.1f}")
    messages = normalize_messages([{"role": "user", "content": f"{CVSS_PROMPTS[lang]}\n\n{description}"}, {"role": "assistant", "content": answer}])
    return sample(source, key, messages, lang=lang, family="security", verified="knowledge"), None


PREFERENCE_PROMPT = "Compare the two responses to the conversation below. Say which one is better and how much, then explain why in one or two sentences."
PREFERENCE_VERDICTS = {
    -3: "Response 1 is much better than Response 2.",
    -2: "Response 1 is better than Response 2.",
    -1: "Response 1 is slightly better than Response 2.",
    0: "Both responses are about equally good.",
    1: "Response 2 is slightly better than Response 1.",
    2: "Response 2 is better than Response 1.",
    3: "Response 2 is much better than Response 1.",
}


def convert_helpsteer3(source, row, spec):
    """A human preference between two responses, with one annotator's reasoning that agrees with the overall verdict."""
    try:
        overall = int(row.get("overall_preference"))
    except (TypeError, ValueError):
        return None, "no_score"
    context = [turn for turn in row.get("context") or [] if isinstance(turn, dict)]
    first, second = text_of(row.get("response1")).strip(), text_of(row.get("response2")).strip()
    if overall not in PREFERENCE_VERDICTS or not context or not first or not second:
        return None, "shape"
    direction = (overall > 0) - (overall < 0)
    reasons = []
    for vote in row.get("individual_preference") or []:
        try:
            score = int(vote.get("score"))
        except (AttributeError, TypeError, ValueError):
            continue
        reasoning = text_of(vote.get("reasoning")).strip()
        if reasoning and (score > 0) - (score < 0) == direction:
            reasons.append(reasoning.replace("@Response", "Response"))
    if not reasons:
        return None, "no_reason"
    conversation = "\n\n".join(f"[{text_of(turn.get('role')) or 'user'}]\n{text_of(turn.get('content')).strip()}" for turn in context)
    question = f"{PREFERENCE_PROMPT}\n\n### Conversation\n{conversation}\n\n### Response 1\n{first}\n\n### Response 2\n{second}"
    messages = normalize_messages([{"role": "user", "content": question}, {"role": "assistant", "content": f"**Verdict:** {PREFERENCE_VERDICTS[overall]}\n\n**Why:** {reasons[0]}"}])
    if not messages:
        return None, "shape"
    return sample(source, digest(question), messages, lang="EN", family="judge", verified="human"), None


CONVERTERS = {
    "aya": convert_aya,
    "self-oss": convert_self_oss,
    "opencodeinstruct": convert_opencodeinstruct,
    "openthoughts": convert_openthoughts,
    "fields": convert_fields,
    "messages": convert_messages,
    "generic": convert_generic,
    "helpsteer": convert_helpsteer,
    "helpsteer3": convert_helpsteer3,
    "template": convert_template,
    "verified-generation": convert_verified_generation,
    "cvss": convert_cvss,
}
# Sources registered before the "hf" blocks existed keep their converters.
LEGACY = {
    "hf-aya-dataset": {"converter": "aya"},
    "hf-oasst2": {"converter": "oasst"},
    "hf-self-oss-instruct": {"converter": "self-oss"},
    "hf-opencodeinstruct": {"converter": "opencodeinstruct", "keep": 0.25},
    "hf-openthoughts-114k": {"converter": "openthoughts"},
}


def spec_of(source):
    """The reading instructions of a source: its "hf" block over the legacy defaults."""
    spec = {"config": None, "split": "train", "keep": 1.0, "converter": "generic"}
    spec.update(LEGACY.get(source["id"], {}))
    spec.update(source.get("hf") or {})
    return spec


def convert_row(source, row, spec):
    """One row through the source's filters and converter: (sample, None) or (None, reason)."""
    if not passes(row, spec.get("where")):
        return None, "filtered"
    convert = CONVERTERS.get(spec["converter"])
    if convert is None:
        raise ValueError(f"{source['id']}: unknown converter {spec['converter']}")
    item, reason = convert(source, row, spec)
    if item is None:
        return None, reason
    if item.get("lang") is None:
        item["lang"] = language_of(row, spec)
        if spec.get("langField") and item["lang"] is None:
            return None, "language"
    if spec.get("family"):
        item["family"] = spec["family"]
    if spec.get("verified") and item.get("verified") == "none":
        item["verified"] = spec["verified"]
    messages = item["messages"]
    if spec.get("dropSystem"):
        messages = [message for message in messages if message["role"] != "system"]
    if len(first_user(messages).strip()) < spec.get("minUserChars", 1):
        return None, "short_prompt"
    if spec.get("wrapAnswer"):
        messages[-1] = {**messages[-1], "content": spec["wrapAnswer"].replace("{answer}", messages[-1]["content"].strip())}
    item["messages"] = messages
    if spec.get("maxChars") and sum(len(message["content"]) + len(message.get("reasoning_content", "")) for message in messages) > spec["maxChars"]:
        return None, "too_long"
    if repetitive("\n".join(f"{message['content']}\n{message.get('reasoning_content', '')}" for message in messages if message["role"] == "assistant")):
        return None, "repetitive"
    item.pop("judgeLanguage", None)
    return item, None


LOOPED_WORD = re.compile(r"\b([^\W\d_]{2,})(?:\W{1,3}\1\b){29,}")


def repetitive(text):
    """A generation stuck in a loop: one word thirty times in a row, or long text that compresses like a loop."""
    if LOOPED_WORD.search(text):
        return True
    if len(text) < 3000:
        return False
    data = text.encode("utf-8")
    return len(zlib.compress(data, 6)) / len(data) < 0.03


def first_user(messages):
    return next((message["content"] for message in messages if message["role"] == "user"), "")


def unique_key(row, item, spec):
    """The value that makes a sample a repeat of an earlier one (spec["uniqueBy"]), or None."""
    name = spec.get("uniqueBy")
    if not name:
        return None
    if name == "$prompt":
        return digest(first_user(item["messages"]).strip())
    value = field(row, name)
    return None if value is None else digest(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True, default=str))


def open_stream(load_dataset, repo, spec, config, options, seed):
    """The rows of one config: from the dataset's own configs, or from its files when spec["format"] is set."""
    if spec.get("format"):
        files = spec.get("dataFiles") or []
        files = [files] if isinstance(files, str) else files
        at = f"@{spec['revision']}" if spec.get("revision") else ""
        stream = load_dataset(spec["format"], data_files={"train": [f"hf://datasets/{repo}{at}/{name}" for name in files]}, split="train", streaming=True, token=options.get("token"))
    else:
        stream = load_dataset(repo, config, split=spec["split"], streaming=True, **options)
    # Reading the files in a seeded order (and rows through a small buffer) spreads a capped import over the whole dataset.
    if spec.get("shuffle", True):
        stream = stream.shuffle(seed=seed, buffer_size=spec.get("shuffleBuffer", 2000))
    return stream


def import_source(source, out_dir, limit=None, seed=20261005):
    from datasets import load_dataset  # imported here so the converters work without the package

    spec = spec_of(source)
    cap = limit or spec.get("importCap") or source.get("cap") or None
    rng = random.Random(f"{seed}:{source['id']}")
    stats = {"rows": 0, "kept": 0, "skipped": {}}
    started = time.time()
    path = os.path.join(out_dir, f"{source['id']}.jsonl")
    token = os.environ.get("HF_TOKEN") or None
    options = {"token": token}
    if spec.get("revision"):
        options["revision"] = spec["revision"]
    if spec.get("dataFiles") and not spec.get("format"):
        options["data_files"] = spec["dataFiles"]
    seen = set()
    with open(path, "w", encoding="utf-8") as handle:
        if spec["converter"] == "oasst":
            languages = spec.get("langMap") or {"tr": "TR", "en": "EN"}
            rows = list(load_dataset(source["repo"], split=spec["split"], **options))
            stats["rows"] = len(rows)
            for root, thread in oasst_threads(rows, tuple(languages)):
                item = convert_oasst_thread(source, root, thread, languages)
                if item:
                    handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                    stats["kept"] += 1
                    if cap and stats["kept"] >= cap:
                        break
        else:
            configs = spec.get("configs") or [spec.get("config")]
            for index, config in enumerate(configs):
                # Each config gets an equal share of what is left of the cap.
                budget = math.ceil((cap - stats["kept"]) / (len(configs) - index)) if cap else None
                if budget is not None and budget <= 0:
                    break
                max_scan = spec.get("maxScan") or (budget * 20 if budget else None)
                kept = scanned = 0
                for row in open_stream(load_dataset, source["repo"], spec, config, options, seed):
                    scanned += 1
                    stats["rows"] += 1
                    if max_scan and scanned > max_scan:
                        stats.setdefault("stoppedAt", {})[str(config)] = "maxScan"
                        break
                    if spec["keep"] < 1.0 and rng.random() > spec["keep"]:
                        continue
                    item, reason = convert_row(source, row, spec)
                    if item is None:
                        stats["skipped"][reason] = stats["skipped"].get(reason, 0) + 1
                        continue
                    key = unique_key(row, item, spec)
                    if key is not None:
                        if key in seen:
                            stats["skipped"]["repeat"] = stats["skipped"].get("repeat", 0) + 1
                            continue
                        seen.add(key)
                    handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                    stats["kept"] += 1
                    kept += 1
                    if budget and kept >= budget:
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
        if source.get("cap") == 0:  # listed for the record, never read
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
