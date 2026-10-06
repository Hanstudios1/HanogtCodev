"""Chooses the samples of the next training round from the data pool.

The pool is training/mix.mjs's output (every sample, deduplicated and
filtered). A round is:

- new samples no earlier round learned, balanced over languages and topic
  families (round-robin over sources inside each, so one big dataset can't
  crowd out the rest);
- a replay of samples earlier rounds learned, so older skills aren't
  forgotten;
- a share of Hanogt's own samples (site knowledge and agent actions), which
  every round repeats.

Choices only depend on the sample ids, the round number and the seen list, so
the same inputs always give the same round.

    python3 training/select_round.py --pool pool/train.jsonl --seen seen.txt --round 3 --size 40000 --out round-3.jsonl

Writes the round's samples (--out) and its summary (--out with .json), whose
"newIds" are added to the seen list once the round is trained.
"""
import argparse
import gzip
import hashlib
import json
import os
import sys

# Shares of a round's new samples by language and by topic family (training/lib/common.mjs).
LANGUAGE_WEIGHTS = {"TR": 0.32, "EN": 0.36, "DE": 0.11, "AZ": 0.10, "RU": 0.11}
FAMILY_GROUPS = {
    "chat": "conversation", "instruction": "conversation",
    "chat-reasoning": "reasoning",
    "math-reasoning": "math",
    "science": "science",
    "knowledge": "knowledge",
    "code-solve": "code", "code-explain": "code", "code-algorithm": "code",
    "security": "security",
    "judge": "judge",
}
GROUP_WEIGHTS = {"conversation": 0.20, "reasoning": 0.10, "math": 0.13, "science": 0.10, "knowledge": 0.12, "code": 0.20, "security": 0.08, "judge": 0.07}
OWN_FAMILIES = {"site", "agent"}


def unit(text):
    """A number in [0, 1) that only depends on the text."""
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16) / float(1 << 48)


def open_text(path, mode="rt"):
    return gzip.open(path, mode, encoding="utf-8") if str(path).endswith(".gz") else open(path, mode, encoding="utf-8")


def read_meta(path):
    """(id, source, lang, family) of every pool sample, in file order."""
    items = []
    with open_text(path) as handle:
        for line in handle:
            if not line.strip():
                continue
            sample = json.loads(line)
            items.append((sample["id"], sample.get("source", ""), sample.get("lang"), sample.get("family", "chat")))
    return items


def read_seen(path):
    if not path or not os.path.exists(path):
        return set()
    with open_text(path) as handle:
        return {line.strip() for line in handle if line.strip()}


def allocate(total, weights, available):
    """Splits `total` over keys by weight, never giving a key more than it has; what one can't take goes to the others."""
    quota = {key: 0 for key in weights}
    remaining = total
    open_keys = {key for key in weights if available.get(key, 0) > 0 and weights[key] > 0}
    while remaining > 0 and open_keys:
        weight_sum = sum(weights[key] for key in open_keys)
        given = 0
        for key in sorted(open_keys):
            share = max(1, int(remaining * weights[key] / weight_sum))
            room = available[key] - quota[key]
            take = min(share, room, remaining - given)
            quota[key] += take
            given += take
            if given >= remaining:
                break
        remaining -= given
        open_keys = {key for key in open_keys if available[key] > quota[key]}
        if given == 0:
            break
    return quota


def round_robin(candidates, count, salt):
    """`count` candidates taken in turn from each source, each source in a stable hashed order."""
    by_source = {}
    for item in candidates:
        by_source.setdefault(item[1], []).append(item)
    queues = [sorted(items, key=lambda item: unit(f"{salt}:{item[0]}")) for _, items in sorted(by_source.items())]
    chosen = []
    index = 0
    while len(chosen) < count and queues:
        queue = queues[index % len(queues)]
        chosen.append(queue.pop(0))
        if not queue:
            queues.remove(queue)
        else:
            index += 1
    return chosen


def select(meta, seen, round_number, size, replay_share=0.15, own_share=0.15, language_weights=None, group_weights=None):
    """The ids of the next round: {"new": [...], "replay": [...], "own": [...]}."""
    language_weights = language_weights or LANGUAGE_WEIGHTS
    group_weights = group_weights or GROUP_WEIGHTS
    own = [item for item in meta if item[3] in OWN_FAMILIES]
    imported = [item for item in meta if item[3] not in OWN_FAMILIES]
    fresh = [item for item in imported if item[0] not in seen]
    learned = [item for item in imported if item[0] in seen]

    own_count = min(len(own), int(size * own_share))
    replay_count = min(len(learned), int(size * replay_share))
    new_count = size - own_count - replay_count

    # New samples: a quota per language × family group, by weight; samples in other languages fill in last.
    strata = {}
    for item in fresh:
        group = FAMILY_GROUPS.get(item[3], "conversation")
        strata.setdefault((item[2], group), []).append(item)
    weights = {key: language_weights.get(key[0], 0.0) * group_weights.get(key[1], 0.0) for key in strata}
    available = {key: len(items) for key, items in strata.items()}
    quota = allocate(new_count, weights, available)
    chosen_new = []
    for key, count in sorted(quota.items()):
        chosen_new.extend(round_robin(strata[key], count, f"new:{key[0]}:{key[1]}"))
    if len(chosen_new) < new_count:
        # Unweighted leftovers (e.g. a language with no weight) once the weighted strata are used up.
        taken = {item[0] for item in chosen_new}
        rest = [item for item in fresh if item[0] not in taken]
        chosen_new.extend(round_robin(rest, new_count - len(chosen_new), "rest"))

    salt = f"round:{round_number}"
    replay = sorted(learned, key=lambda item: unit(f"{salt}:replay:{item[0]}"))[:replay_count]
    own_chosen = sorted(own, key=lambda item: unit(f"{salt}:own:{item[0]}"))[:own_count]
    return {"new": [item[0] for item in chosen_new], "replay": [item[0] for item in replay], "own": [item[0] for item in own_chosen]}


def describe(meta, ids):
    wanted = set(ids)
    counts = {"byLanguage": {}, "byFamily": {}, "bySource": {}}
    for item_id, source, lang, family in meta:
        if item_id not in wanted:
            continue
        for key, value in (("byLanguage", lang or "?"), ("byFamily", family), ("bySource", source)):
            counts[key][value] = counts[key].get(value, 0) + 1
    return counts


def write_round(pool_path, out_path, selection, round_number):
    """Copies the chosen samples, in a stable shuffled order, and returns how many were written."""
    wanted = set(selection["new"]) | set(selection["replay"]) | set(selection["own"])
    lines = []
    with open_text(pool_path) as handle:
        for line in handle:
            if not line.strip():
                continue
            item_id = json.loads(line)["id"]
            if item_id in wanted:
                lines.append((unit(f"order:{round_number}:{item_id}"), line.rstrip("\n")))
    lines.sort()
    with open_text(out_path, "wt") as handle:
        for _, line in lines:
            handle.write(line + "\n")
    return len(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--pool", required=True, help="the pool's train.jsonl (or .jsonl.gz)")
    parser.add_argument("--seen", help="ids learned by earlier rounds, one per line (optional; .gz allowed)")
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--size", type=int, default=40000)
    parser.add_argument("--replay-share", type=float, default=0.15)
    parser.add_argument("--own-share", type=float, default=0.15)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    meta = read_meta(args.pool)
    seen = read_seen(args.seen)
    selection = select(meta, seen, args.round, args.size, args.replay_share, args.own_share)
    written = write_round(args.pool, args.out, selection, args.round)
    summary = {
        "round": args.round,
        "samples": written,
        "new": len(selection["new"]),
        "replay": len(selection["replay"]),
        "own": len(selection["own"]),
        "poolSamples": len(meta),
        "poolUnseen": sum(1 for item in meta if item[0] not in seen and item[3] not in OWN_FAMILIES),
        **describe(meta, selection["new"] + selection["replay"] + selection["own"]),
        "newIds": selection["new"],
    }
    summary_path = (args.out[:-3] if args.out.endswith(".gz") else args.out).rsplit(".", 1)[0] + ".json"
    with open(summary_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    print(json.dumps({key: value for key, value in summary.items() if key != "newIds"}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
