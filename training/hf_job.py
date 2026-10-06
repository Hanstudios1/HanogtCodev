#!/usr/bin/env python3
"""Trains Hanogt AI on Hugging Face Jobs (needs a PRO account or a Team/Enterprise
organization, and credits: GPU time is paid by the minute).

  1. Upload the data set and the training code to a private dataset repository:
       HF_TOKEN=... python3 training/hf_job.py upload --dataset-repo HanStudios/hanogt-sft-v2
  2. See what a run would cost (nothing is started):
       python3 training/hf_job.py plan --preset small --flavor a100-large
  3. Start it (only with --confirm, because it spends money):
       HF_TOKEN=... python3 training/hf_job.py launch --dataset-repo HanStudios/hanogt-sft-v2 \\
           --model-repo HanStudios/hanogt-ai-qwen3-8b-lora --preset small --flavor a100-large --confirm

The job installs the trainer's requirements, downloads the dataset repository,
runs training/train_lora.py and uploads the LoRA adapter to --model-repo
(private). Prices and speeds below are rough estimates for planning; the
Jobs page shows the real price of each flavor.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shlex
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "training" / "data" / "v2"
CODE_FILES = ["training/train_lora.py", "training/merge_and_export.py", "training/requirements.txt"]

# US dollars an hour (approximate) and training speed in tokens a second (rough estimates: QLoRA for
# "small", 16-bit LoRA for the Qwen3.5-family presets).
FLAVORS = {
    "l4x1": {"usdPerHour": 0.8, "memoryGb": 24},
    "a10g-large": {"usdPerHour": 1.5, "memoryGb": 24},
    "a100-large": {"usdPerHour": 2.5, "memoryGb": 80},
    "h100": {"usdPerHour": 4.5, "memoryGb": 80},
}
SPEED = {
    ("small", "l4x1"): 900,
    ("small", "a10g-large"): 1200,
    ("small", "a100-large"): 3500,
    ("small", "h100"): 7000,
    ("4b", "l4x1"): 1500,
    ("4b", "a10g-large"): 1800,
    ("4b", "a100-large"): 6000,
    ("4b", "h100"): 11000,
    ("27b", "a100-large"): 1000,
    ("27b", "h100"): 2000,
}
DEFAULT_IMAGE = "pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime"


def token():
    value = os.environ.get("HF_TOKEN")
    if not value:
        sys.exit("HF_TOKEN is not set (a write token from huggingface.co/settings/tokens, stored as an environment variable).")
    return value


def estimate(preset, flavor, epochs, tokens):
    speed = SPEED.get((preset, flavor))
    if speed is None:
        return None
    hours = tokens * epochs / speed / 3600 * 1.15  # + loading, evaluation and saving
    return {"hours": round(hours, 1), "usd": round(hours * FLAVORS[flavor]["usdPerHour"], 2), "tokensPerSecond": speed}


def manifest_tokens(data_dir=DATA):
    path = Path(data_dir) / "manifest.json"
    if not path.exists():
        sys.exit(f"{path} is missing: build the set first (node training/mix.mjs).")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    return manifest["train"]["approxTokens"], manifest["train"]["samples"]


def job_script(dataset_repo, model_repo, preset, epochs, extra):
    """The shell script the job runs (the token reaches it as the HF_TOKEN secret)."""
    train = ["python", "code/train_lora.py", "--preset", preset, "--data", "train.jsonl", "--eval-data", "eval.jsonl", "--epochs", str(epochs), "--output", "out", "--push-to-hub", model_repo, *extra]
    return "\n".join([
        "set -euo pipefail",
        "pip install -q 'transformers>=5.0' 'peft>=0.17' 'accelerate>=1.2' 'safetensors>=0.4' 'bitsandbytes>=0.45' 'huggingface_hub>=0.35'",
        f"python -c \"from huggingface_hub import snapshot_download; snapshot_download({dataset_repo!r}, repo_type='dataset', local_dir='/work')\"",
        "cd /work",
        " ".join(shlex.quote(part) for part in train),
    ])


def command_upload(args):
    from huggingface_hub import HfApi

    api = HfApi(token=token())
    data = Path(args.data)
    for name in ("train.jsonl", "eval.jsonl", "manifest.json", "README.md", "ATTRIBUTION.md"):
        if not (data / name).exists():
            sys.exit(f"{data / name} is missing: run node training/mix.mjs first.")
    api.create_repo(args.dataset_repo, repo_type="dataset", private=True, exist_ok=True)
    api.upload_folder(repo_id=args.dataset_repo, repo_type="dataset", folder_path=str(data), allow_patterns=["*.jsonl", "*.json", "*.md"], commit_message="Hanogt SFT v2")
    for file in CODE_FILES:
        api.upload_file(repo_id=args.dataset_repo, repo_type="dataset", path_or_fileobj=str(ROOT / file), path_in_repo=f"code/{Path(file).name}", commit_message="Training code")
    print(f"uploaded to https://huggingface.co/datasets/{args.dataset_repo} (private)")


def command_plan(args):
    tokens, samples = manifest_tokens(args.data)
    result = estimate(args.preset, args.flavor, args.epochs, tokens)
    print(f"set: {samples:,} samples, ~{tokens / 1e6:.1f} million tokens")
    if result is None:
        print(f"no estimate for preset {args.preset} on {args.flavor} (27b needs an 80 GB GPU: a100-large or h100)")
        return
    print(f"{args.preset} on {args.flavor}, {args.epochs} epoch(s): ~{result['hours']} hours, ~${result['usd']} (at ~{result['tokensPerSecond']:,} tokens/s and ~${FLAVORS[args.flavor]['usdPerHour']}/hour; check the Jobs page for the real price)")


def command_launch(args):
    tokens, _ = manifest_tokens(args.data)
    result = estimate(args.preset, args.flavor, args.epochs, tokens)
    script = job_script(args.dataset_repo, args.model_repo, args.preset, args.epochs, args.extra)
    hours = max(1, math.ceil((result["hours"] if result else 24) * 1.5))
    print(f"flavor {args.flavor}, timeout {hours}h, image {args.image}")
    if result:
        print(f"estimate: ~{result['hours']} hours, ~${result['usd']}")
    print("job script:\n" + script)
    if not args.confirm:
        print("\nnot started: add --confirm to start the job (it is billed by the minute).")
        return
    from huggingface_hub import HfApi

    api = HfApi(token=token())
    job = api.run_job(image=args.image, command=["bash", "-lc", script], flavor=args.flavor, timeout=f"{hours}h", secrets={"HF_TOKEN": token()})
    owner = getattr(job, "owner", None)
    namespace = getattr(owner, "name", None) or args.dataset_repo.split("/")[0]
    print(f"started job {job.id}: https://huggingface.co/jobs/{namespace}/{job.id}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("upload", "plan", "launch"):
        command = sub.add_parser(name)
        command.add_argument("--data", default=str(DATA))
        if name in ("upload", "launch"):
            command.add_argument("--dataset-repo", required=True, help="e.g. HanStudios/hanogt-sft-v2 (private)")
        if name in ("plan", "launch"):
            command.add_argument("--preset", choices=["small", "4b", "27b"], default="small", help="small = Qwen3-8B, 4b = Qwen3.5-4B, 27b = Qwen3.8-27B (80 GB GPU)")
            command.add_argument("--flavor", choices=sorted(FLAVORS), default="a100-large")
            command.add_argument("--epochs", type=float, default=1.0)
        if name == "launch":
            command.add_argument("--model-repo", required=True, help="where the adapter goes, e.g. HanStudios/hanogt-ai-qwen3-8b-lora (private)")
            command.add_argument("--image", default=DEFAULT_IMAGE)
            command.add_argument("--confirm", action="store_true", help="really start the paid job")
            command.add_argument("extra", nargs="*", help="more train_lora.py arguments after --")
    args = parser.parse_args(argv)
    {"upload": command_upload, "plan": command_plan, "launch": command_launch}[args.command](args)


if __name__ == "__main__":
    main()
