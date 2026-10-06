#!/usr/bin/env python3
"""Hanogt AI's training on Kaggle (or any machine with Hugging Face access), session after session.

Every run does what is due, then stops before the session ends:

1. Data. The imports are refreshed when they changed: the GitHub sources
   (node training/import-github.mjs) when their registry entries or importer
   changed, and only the Hugging Face sources whose registry entry changed
   (training/import_hf.py --only …). The pool is mixed again
   (node training/mix.mjs) when anything it depends on changed: the imports,
   the site's own knowledge or the mixing code. Imports and pool go to the
   private dataset repository (--data-repo). Without a GPU that is all a run
   does, so a free CPU session can prepare the data.
2. Training, with a GPU. Rounds follow each other until the time is nearly
   up: the round in progress continues from its last checkpoint; otherwise
   the next round is chosen (training/select_round.py: new data, a replay of
   learned data and Hanogt's own samples) and trained from the previous
   round's adapter. Progress lives in the model repository (--model-repo):
   state/rounds.json and state/seen.txt.gz, the adapter at its root and a
   copy per round under rounds/.

    python3 training/kaggle_run.py --data-repo HanStudios/hanogt-sft-pool --model-repo HanStudios/hanogt-ai-qwen3-8b-lora

Messages are Turkish: they are read by the site's owner in Kaggle's log.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GITHUB_CODE = ["training/import-github.mjs", "training/lib/common.mjs", "training/lib/jest-lite.mjs", "training/lib/thealgorithms.py"]
HF_CODE = ["training/import_hf.py"]
MIX_CODE = ["training/mix.mjs", "training/lib/common.mjs"]
SITE_INPUTS = ["training/build-dataset.mjs", "src/lib/ai", "src/lib/server/hanogt-ai.ts", "ai/dataset", "scripts/ai-eval/bench-tasks.mjs"]
STATE_FILE = "state/rounds.json"
SEEN_FILE = "state/seen.txt.gz"
NODE_DIST = "https://nodejs.org/dist/latest-v22.x/"


def say(message):
    print(message, flush=True)


# ---------------------------------------------------------------- versions (pure)

def files_hash(paths, root=ROOT):
    """A digest of these files and folders (their relative paths and contents)."""
    digest = hashlib.sha256()
    for item in sorted(paths):
        target = Path(root) / item
        files = sorted(path for path in target.rglob("*") if path.is_file() and "__pycache__" not in path.parts) if target.is_dir() else [target]
        for path in files:
            digest.update(str(path.relative_to(root)).encode("utf-8"))
            digest.update(path.read_bytes() if path.exists() else b"missing")
    return digest.hexdigest()[:16]


def text_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def hf_wanted(registry, importer_hash):
    """The Hugging Face sources to have imported, each with the fingerprint of its entry and importer."""
    return {source["id"]: text_hash([source, importer_hash]) for source in registry["sources"] if source.get("kind") == "hf" and source.get("status") == "allowed"}


def import_plan(registry, raw_manifest, importer_hash):
    """(to import, to remove): sources whose entry or importer changed (or failed last time), and imports no longer wanted."""
    wanted = hf_wanted(registry, importer_hash)
    done = (raw_manifest or {}).get("hf", {})
    todo = [source for source, fingerprint in wanted.items() if done.get(source, {}).get("fingerprint") != fingerprint or done.get(source, {}).get("error")]
    removed = sorted(source for source in done if source not in wanted)
    return todo, removed


def github_fingerprint(registry, code_hash):
    entries = [source for source in registry["sources"] if source.get("kind") == "github"]
    return text_hash([entries, code_hash])


def pool_version(raw_manifest, site_hash, mix_hash):
    """What the pool is made of: every import's fingerprint, the site's knowledge and the mixing code."""
    raw = raw_manifest or {}
    parts = {"github": (raw.get("github") or {}).get("fingerprint"), "hf": {key: value.get("fingerprint") for key, value in sorted((raw.get("hf") or {}).items()) if not value.get("error")}, "site": site_hash, "mix": mix_hash}
    return text_hash(parts)


def empty_state():
    return {"version": 1, "rounds": [], "active": None}


def next_round_number(state):
    numbers = [item["round"] for item in state.get("rounds", [])]
    if state.get("active"):
        numbers.append(state["active"]["round"])
    return max(numbers, default=0) + 1


def finish_round(state, status):
    """The state once the active round finished: it joins the completed rounds."""
    active = state["active"]
    done = {**active, "finished": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "steps": status.get("step"), "metrics": status.get("metrics", {})}
    done.pop("file", None)
    return {**state, "rounds": [*state.get("rounds", []), done], "active": None}


# ---------------------------------------------------------------- hub helpers

def api():
    from huggingface_hub import HfApi

    return HfApi(token=os.environ.get("HF_TOKEN"))


def download(repo, filename, repo_type, folder):
    """A file of a repository, or None when the repository or the file isn't there."""
    from huggingface_hub import hf_hub_download

    try:
        return hf_hub_download(repo_id=repo, filename=filename, repo_type=repo_type, local_dir=str(folder), token=os.environ.get("HF_TOKEN"))
    except Exception as error:  # noqa: BLE001 - missing repository, file or revision all mean "not yet"
        if type(error).__name__ in ("EntryNotFoundError", "RepositoryNotFoundError", "RevisionNotFoundError", "RemoteEntryNotFoundError") or "404" in str(error):
            return None
        raise


def read_json(repo, filename, repo_type, folder, default=None):
    path = download(repo, filename, repo_type, folder)
    if not path:
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def upload(repo, local, path_in_repo, repo_type, message):
    api().upload_file(path_or_fileobj=str(local), path_in_repo=path_in_repo, repo_id=repo, repo_type=repo_type, commit_message=message)


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def gzip_file(source, target):
    with open(source, "rb") as reader, gzip.open(target, "wb", compresslevel=6) as writer:
        shutil.copyfileobj(reader, writer)


def gunzip_file(source, target):
    with gzip.open(source, "rb") as reader, open(target, "wb") as writer:
        shutil.copyfileobj(reader, writer)


def run(command, **options):
    say("$ " + " ".join(str(part) for part in command))
    subprocess.run([str(part) for part in command], check=True, cwd=str(ROOT), **options)


# ---------------------------------------------------------------- node

def node_version(binary):
    try:
        output = subprocess.run([binary, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    parts = output.lstrip("v").split(".")
    return tuple(int(part) for part in parts[:2]) if len(parts) >= 2 else None


def ensure_node(work):
    """Node 22.12+ (the pipeline runs TypeScript files directly): the one installed, or the latest 22.x from nodejs.org, checksum verified."""
    current = shutil.which("node")
    if current and (node_version(current) or (0, 0)) >= (22, 12):
        return current
    say("▶ Node.js 22 indiriliyor (nodejs.org)…")
    with urllib.request.urlopen(NODE_DIST + "SHASUMS256.txt", timeout=60) as response:
        sums = response.read().decode("utf-8")
    line = next(line for line in sums.splitlines() if line.endswith("-linux-x64.tar.xz"))
    expected, name = line.split()
    archive = Path(work) / name
    with urllib.request.urlopen(NODE_DIST + name, timeout=300) as response:
        archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        sys.exit("Node.js arşivinin sağlama toplamı tutmadı; indirme bozuk.")
    with tarfile.open(archive) as bundle:
        # The archive's checksum was verified against nodejs.org; "data" also refuses links out of the folder.
        if hasattr(tarfile, "data_filter"):
            bundle.extractall(work, filter="data")
        else:
            bundle.extractall(work)  # noqa: S202
    binary = Path(work) / name.replace(".tar.xz", "") / "bin" / "node"
    os.environ["PATH"] = f"{binary.parent}{os.pathsep}{os.environ['PATH']}"
    return str(binary)


# ---------------------------------------------------------------- data

def prepare_data(args, work):
    """Refreshes what changed and returns the pool's version (the pool files are in the dataset repository)."""
    registry = json.loads((ROOT / "training/sources.json").read_text(encoding="utf-8"))
    raw_dir = Path(work) / "raw"
    github_dir = raw_dir / "github"
    hf_dir = raw_dir / "hf"
    for folder in (github_dir, hf_dir):
        folder.mkdir(parents=True, exist_ok=True)
    api().create_repo(args.data_repo, repo_type="dataset", private=True, exist_ok=True)
    manifest = read_json(args.data_repo, "raw/manifest.json", "dataset", raw_dir / "remote", {"github": None, "hf": {}})

    # 1. GitHub sources.
    github_print = github_fingerprint(registry, files_hash(GITHUB_CODE))
    github_fresh = (manifest.get("github") or {}).get("fingerprint") == github_print
    # 2. Hugging Face sources.
    hf_hash = files_hash(HF_CODE)
    todo, removed = import_plan(registry, manifest, hf_hash)
    wanted = hf_wanted(registry, hf_hash)
    site_hash = files_hash(SITE_INPUTS)
    # Samples that can't fit the training context are left out of the pool already (about 3.2 characters per token).
    max_chars = int(args.max_seq_len * 3.2)
    mix_hash = text_hash(f"{files_hash(MIX_CODE)}:{max_chars}")

    node = None
    if not github_fresh:
        say("▶ Veri: GitHub kaynakları (Exercism, The Algorithms, GSM8K) içe aktarılıyor…")
        node = ensure_node(work)
        run([node, "training/import-github.mjs", "--out", github_dir])
        for path in sorted(github_dir.glob("*")):
            if path.is_file() and not path.name.endswith(".gz"):
                gzip_file(path, path.with_suffix(path.suffix + ".gz"))
        api().upload_folder(repo_id=args.data_repo, repo_type="dataset", folder_path=str(github_dir), path_in_repo="raw/github", allow_patterns=["*.gz"], commit_message="GitHub kaynakları")
        manifest["github"] = {"fingerprint": github_print, "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    else:
        say("✓ Veri: GitHub kaynakları güncel.")

    if todo:
        say(f"▶ Veri: {len(todo)} Hugging Face kaynağı içe aktarılıyor: {', '.join(todo)}")
        run([sys.executable, "training/import_hf.py", "--only", ",".join(todo), "--out", hf_dir])
        report = json.loads((hf_dir / "manifest.json").read_text(encoding="utf-8"))["sources"]
        for source in todo:
            record = report.get(source, {"error": "no record"})
            local = hf_dir / f"{source}.jsonl"
            if record.get("error") or not local.exists():
                say(f"  ✗ {source}: {record.get('error', 'dosya yok')}")
                manifest["hf"][source] = {"fingerprint": wanted[source], "error": record.get("error", "no file")}
                continue
            gzip_file(local, hf_dir / f"{source}.jsonl.gz")
            upload(args.data_repo, hf_dir / f"{source}.jsonl.gz", f"raw/hf/{source}.jsonl.gz", "dataset", f"HF kaynağı: {source}")
            manifest["hf"][source] = {"fingerprint": wanted[source], "kept": record.get("kept"), "rows": record.get("rows"), "revision": record.get("revision"), "license": record.get("license")}
            say(f"  ✓ {source}: {record.get('kept')} örnek")
    else:
        say("✓ Veri: Hugging Face kaynakları güncel.")
    for source in removed:
        say(f"  − {source} artık kayıtta izinli değil; havuzdan çıkarılıyor.")
        manifest["hf"].pop(source, None)
        try:
            api().delete_file(path_in_repo=f"raw/hf/{source}.jsonl.gz", repo_id=args.data_repo, repo_type="dataset", commit_message=f"Kaldırıldı: {source}")
        except Exception:  # noqa: BLE001 - already gone
            pass
    if todo or removed or not github_fresh:
        write_json(raw_dir / "manifest.json", manifest)
        upload(args.data_repo, raw_dir / "manifest.json", "raw/manifest.json", "dataset", "İçe aktarma kaydı")

    version = pool_version(manifest, site_hash, mix_hash)
    pool = read_json(args.data_repo, "pool/manifest.json", "dataset", Path(work) / "remote-pool", None)
    if pool and pool.get("poolVersion") == version and args.rebuild != "always":
        say(f"✓ Veri havuzu güncel ({pool.get('all', {}).get('samples', '?')} örnek, sürüm {version}).")
        return version

    say("▶ Veri havuzu karıştırılıyor (site + GitHub + Hugging Face)…")
    node = node or ensure_node(work)
    for source, record in manifest["hf"].items():
        local = hf_dir / f"{source}.jsonl"
        if record.get("error") or local.exists():
            continue
        path = download(args.data_repo, f"raw/hf/{source}.jsonl.gz", "dataset", raw_dir / "remote")
        if path:
            gunzip_file(path, local)
    if github_fresh:
        for name in api().list_repo_files(args.data_repo, repo_type="dataset"):
            if name.startswith("raw/github/") and name.endswith(".gz"):
                path = download(args.data_repo, name, "dataset", raw_dir / "remote")
                gunzip_file(path, github_dir / Path(name).name[:-3])
    pool_dir = Path(work) / "pool"
    run([node, f"--max-old-space-size={args.node_memory_mb}", "training/mix.mjs", "--out", pool_dir, "--github", github_dir, "--hf", hf_dir, "--report", "", "--max-chars", max_chars])
    built = json.loads((pool_dir / "manifest.json").read_text(encoding="utf-8"))
    built["poolVersion"] = version
    write_json(pool_dir / "manifest.json", built)
    for name in ("train.jsonl", "eval.jsonl"):
        gzip_file(pool_dir / name, pool_dir / f"{name}.gz")
    staging = Path(work) / "pool-upload"
    shutil.rmtree(staging, ignore_errors=True)
    (staging / "pool").mkdir(parents=True)
    for name in ("train.jsonl.gz", "eval.jsonl.gz", "manifest.json"):
        shutil.copy(pool_dir / name, staging / "pool" / name)
    for name in ("README.md", "ATTRIBUTION.md"):
        shutil.copy(pool_dir / name, staging / name)
    api().upload_folder(repo_id=args.data_repo, repo_type="dataset", folder_path=str(staging), commit_message=f"Veri havuzu {version}")
    say(f"✓ Veri havuzu hazır: {built['all']['samples']} örnek, ~{built['all']['approxTokens'] / 1e6:.0f} milyon token (sürüm {version}).")
    return version


# ---------------------------------------------------------------- training

def gpu_count():
    try:
        import torch
    except ImportError:
        return 0
    return torch.cuda.device_count() if torch.cuda.is_available() else 0


def load_state(args, folder):
    state = read_json(args.model_repo, STATE_FILE, "model", folder, None) or empty_state()
    seen_path = download(args.model_repo, SEEN_FILE, "model", folder)
    seen = set()
    if seen_path:
        with gzip.open(seen_path, "rt", encoding="utf-8") as handle:
            seen = {line.strip() for line in handle if line.strip()}
    return state, seen


def save_state(args, state, folder, seen=None):
    write_json(Path(folder) / "rounds.json", state)
    upload(args.model_repo, Path(folder) / "rounds.json", STATE_FILE, "model", "Eğitim durumu")
    if seen is not None:
        with gzip.open(Path(folder) / "seen.txt.gz", "wt", encoding="utf-8") as handle:
            for item in sorted(seen):
                handle.write(item + "\n")
        upload(args.model_repo, Path(folder) / "seen.txt.gz", SEEN_FILE, "model", "Öğrenilen örnekler")


def has_adapter(args):
    try:
        return "adapter_config.json" in api().list_repo_files(args.model_repo, repo_type="model")
    except Exception:  # noqa: BLE001 - no repository yet
        return False


def eval_subset(source_gz, target, size=300):
    """A fixed, small evaluation set (the same every round, so losses compare)."""
    with gzip.open(source_gz, "rt", encoding="utf-8") as handle:
        lines = [line for line in handle if line.strip()]
    lines.sort(key=lambda line: hashlib.sha256(json.loads(line)["id"].encode("utf-8")).hexdigest())
    Path(target).write_text("".join(lines[:size]), encoding="utf-8")


def train(args, work, version):
    gpus = gpu_count()
    if not gpus:
        say("ℹ GPU yok: veri hazırlandı. Eğitim için sağ panelde Accelerator → GPU T4 x2 seçip yeniden çalıştır.")
        return
    deadline = START + args.hours * 3600
    folder = Path(work) / "state"
    folder.mkdir(parents=True, exist_ok=True)
    api().create_repo(args.model_repo, repo_type="model", private=True, exist_ok=True)
    state, seen = load_state(args, folder)
    pool_dir = Path(work) / "pool-remote"
    eval_path = Path(work) / "eval.jsonl"
    if not eval_path.exists():
        path = download(args.data_repo, "pool/eval.jsonl.gz", "dataset", pool_dir)
        if path:
            eval_subset(path, eval_path, args.eval_samples)

    while True:
        left = (deadline - time.time()) / 3600
        if left < args.min_round_hours:
            say(f"⏸ Bu oturumda {left:.1f} saat kaldı; yeni tura başlanmıyor.")
            return
        resume = bool(state.get("active"))
        if resume:
            active = state["active"]
            say(f"▶ Tur {active['round']} kaldığı yerden sürüyor.")
            local_gz = download(args.data_repo, active["file"], "dataset", Path(work) / "rounds")
            if not local_gz:
                say("✗ Turun veri dosyası bulunamadı; tur baştan seçilecek.")
                state["active"] = None
                continue
        else:
            number = next_round_number(state)
            pool_train = download(args.data_repo, "pool/train.jsonl.gz", "dataset", pool_dir)
            if not pool_train:
                say("✗ Veri havuzu yok: önce veri hazırlanmalı.")
                return
            seen_path = Path(work) / "seen.txt"
            seen_path.write_text("".join(item + "\n" for item in sorted(seen)), encoding="utf-8")
            local_gz = Path(work) / "rounds" / f"round-{number:03d}.jsonl.gz"
            local_gz.parent.mkdir(parents=True, exist_ok=True)
            run([sys.executable, "training/select_round.py", "--pool", pool_train, "--seen", seen_path, "--round", number, "--size", args.round_samples, "--out", local_gz])
            summary = json.loads(Path(str(local_gz).replace(".jsonl.gz", ".json")).read_text(encoding="utf-8"))
            if summary["new"] < args.min_new:
                say(f"✓ Havuzdaki bütün yeni veriler öğrenildi ({summary['poolUnseen']} yeni örnek kaldı). Kayda yeni kaynak eklenince yeni tur başlar.")
                return
            upload(args.data_repo, local_gz, f"rounds/round-{number:03d}.jsonl.gz", "dataset", f"Tur {number} verisi")
            # The previous round's checkpoint must not be resumed by this one.
            try:
                api().delete_folder(path_in_repo="last-checkpoint", repo_id=args.model_repo, repo_type="model", commit_message=f"Tur {number} başlıyor")
            except Exception:  # noqa: BLE001 - nothing to delete
                pass
            state["active"] = {
                "round": number,
                "pool": version,
                "file": f"rounds/round-{number:03d}.jsonl.gz",
                "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "samples": summary["samples"],
                "new": summary["new"],
                "replay": summary["replay"],
                "own": summary["own"],
                "byLanguage": summary["byLanguage"],
                "byFamily": summary["byFamily"],
                "initFrom": args.model_repo if (state.get("rounds") or has_adapter(args)) else None,
            }
            state["active"]["newIdsFile"] = f"rounds/round-{number:03d}.json"
            upload(args.data_repo, Path(str(local_gz).replace(".jsonl.gz", ".json")), state["active"]["newIdsFile"], "dataset", f"Tur {number} özeti")
            save_state(args, state, folder)
            say(f"▶ Tur {number} başlıyor: {summary['samples']} örnek ({summary['new']} yeni, {summary['replay']} tekrar, {summary['own']} Hanogt). Diller: {summary['byLanguage']}")

        active = state["active"]
        data_path = Path(work) / f"round-{active['round']:03d}.jsonl"
        gunzip_file(local_gz, data_path)
        out = Path(work) / f"out-round-{active['round']:03d}"
        # Outside the output folder: the trainer uploads that folder's files with every checkpoint.
        status_path = Path(work) / f"status-round-{active['round']:03d}.json"
        out.mkdir(parents=True, exist_ok=True)
        status_path.unlink(missing_ok=True)
        launcher = ["torchrun", f"--nproc_per_node={gpus}"] if gpus > 1 else [sys.executable]
        command = launcher + [
            "training/train_lora.py", "--preset", "small", "--base-model", args.base_model,
            "--data", data_path, "--eval-data", eval_path if eval_path.exists() else "",
            "--output", out, "--epochs", 1, "--max-seq-len", args.max_seq_len,
            "--lr", args.lr if active["round"] == 1 else args.lr_next,
            "--save-steps", args.save_steps,
            "--hub-checkpoints", args.model_repo, "--push-to-hub", args.model_repo,
            "--time-budget-hours", round(max(0.2, (deadline - time.time()) / 3600 - args.upload_margin_hours), 2),
            "--status-file", status_path,
        ]
        if resume:
            command.append("--resume-from-hub")
        elif active.get("initFrom"):
            command += ["--init-adapter", active["initFrom"]]
        run(command)
        status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {"status": "unknown"}
        if status.get("status") != "finished":
            say(f"⏸ Süre doldu: tur {active['round']} adım {status.get('step')}'de kaydedildi; sonraki çalıştırmada kaldığı yerden sürer.")
            return
        # Finished: keep a copy of this round's adapter and remember what it learned.
        api().upload_folder(repo_id=args.model_repo, repo_type="model", folder_path=str(out / "adapter"), path_in_repo=f"rounds/round-{active['round']:03d}", commit_message=f"Tur {active['round']} bağdaştırıcısı")
        summary_path = download(args.data_repo, active["newIdsFile"], "dataset", Path(work) / "rounds")
        new_ids = json.loads(Path(summary_path).read_text(encoding="utf-8"))["newIds"] if summary_path else []
        seen |= set(new_ids)
        state = finish_round(state, status)
        save_state(args, state, folder, seen)
        loss = status.get("metrics", {}).get("eval_loss")
        say(f"✓ Tur {active['round']} bitti (adım {status.get('step')}{f', değerlendirme kaybı {loss:.3f}' if isinstance(loss, (int, float)) else ''}). Öğrenilen örnek: {len(seen)}.")


START = time.time()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data-repo", default="HanStudios/hanogt-sft-pool")
    parser.add_argument("--model-repo", default="HanStudios/hanogt-ai-qwen3-8b-lora")
    parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
    parser.add_argument("--hours", type=float, default=11.0, help="time this session may use (Kaggle: 12 hours)")
    parser.add_argument("--rebuild", choices=["auto", "always", "never"], default="auto", help="auto: refresh the data when it changed")
    parser.add_argument("--round-samples", type=int, default=20000)
    parser.add_argument("--min-new", type=int, default=2000, help="no round starts with fewer new samples than this")
    parser.add_argument("--eval-samples", type=int, default=300)
    parser.add_argument("--max-seq-len", type=int, default=4096)
    parser.add_argument("--lr", type=float, default=2e-4, help="first round")
    parser.add_argument("--lr-next", type=float, default=1e-4, help="later rounds")
    parser.add_argument("--save-steps", type=int, default=250)
    parser.add_argument("--min-round-hours", type=float, default=1.0)
    parser.add_argument("--upload-margin-hours", type=float, default=0.5)
    parser.add_argument("--node-memory-mb", type=int, default=20000)
    parser.add_argument("--work", default="/kaggle/temp/hanogt" if Path("/kaggle/temp").exists() else "/tmp/hanogt")
    args = parser.parse_args(argv)
    if not os.environ.get("HF_TOKEN"):
        sys.exit("HF_TOKEN yok: Kaggle'da Add-ons → Secrets → HF_TOKEN ekleyip bu deftere bağla.")
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    version = None
    if args.rebuild != "never":
        version = prepare_data(args, work)
    else:
        pool = read_json(args.data_repo, "pool/manifest.json", "dataset", work / "remote-pool", {}) or {}
        version = pool.get("poolVersion")
    train(args, work, version)
    say("Bitti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
