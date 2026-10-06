#!/usr/bin/env python3
"""LoRA / QLoRA fine-tuning of a Qwen model on the Hanogt SFT set.

The data comes from `node training/mix.mjs` (set v2: the site's own samples,
the GitHub sources and, once imported, the Hugging Face sources) or, for the
site alone, `node training/build-dataset.mjs` (chat JSONL: "messages" and, for
agent samples, "tools"). Only the assistant's turns are learned: the system
prompt, the user's words and tool results are context. A last assistant
message with "reasoning_content" is rendered by Qwen3's chat template as a
<think> block, so the model learns to show its thinking on those samples.

Base models (the model is a parameter; "Qwen 2.7" doesn't exist):
  --preset 27b    Qwen/Qwen3.6-27B (default; Apache-2.0, text + vision, hybrid
                  Gated DeltaNet + attention). QLoRA needs one 80 GB GPU.
  --preset small  Qwen/Qwen3-8B (text only). QLoRA fits a 24 GB GPU.
  --base-model    any other Hugging Face model with a ChatML chat template.

  python training/train_lora.py --preset 27b
  python training/train_lora.py --preset small --epochs 3
  python training/train_lora.py --dry-run          # data and token counts only, no GPU
  python training/train_lora.py --preset small --push-to-hub HanStudios/hanogt-ai-qwen3-8b-lora

Runs in time-limited sessions (Kaggle's 12 hours, training/kaggle/): upload
each checkpoint with --hub-checkpoints, stop in time with --time-budget-hours
and continue in the next session with --resume-from-hub.

Training goes on in rounds (training/kaggle_run.py): each round starts from
the adapter the previous one produced (--init-adapter, a folder or a model
repository) and learns new data plus a replay of older data
(training/select_round.py). --status-file records whether the run finished or
stopped for time.

  python training/train_lora.py --preset small --hub-checkpoints HanStudios/hanogt-ai-qwen3-8b-lora \
      --resume-from-hub --time-budget-hours 11 --push-to-hub HanStudios/hanogt-ai-qwen3-8b-lora

The adapter goes to --output (training/output/<name>/adapter) and, with
--push-to-hub, to a private Hugging Face model repository (HF_TOKEN). Merge it
with training/merge_and_export.py or serve it directly with vLLM (--enable-lora).
See training/README.md.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import math
import os
import re
import sys
import time
from pathlib import Path

PRESETS = {
    "27b": {"base_model": "Qwen/Qwen3.6-27B", "lr": 1e-4, "grad_accum": 16},
    "small": {"base_model": "Qwen/Qwen3-8B", "lr": 2e-4, "grad_accum": 8},
}

# The linear layers LoRA adapts: attention (q/k/v/o), the Gated DeltaNet projections of
# Qwen3.5/3.6 (in_proj_qkv, in_proj_z, in_proj_b, in_proj_a, out_proj; adapting in_proj_qkv
# without in_proj_z breaks vLLM's LoRA loading) and the MLP. The vision tower and the
# multi-token-prediction head stay as they are.
TARGET_MODULES = r"^(?!.*(?:visual|vision|mtp)).*\.(?:q_proj|k_proj|v_proj|o_proj|in_proj_qkv|in_proj_z|in_proj_b|in_proj_a|out_proj|gate_proj|up_proj|down_proj)$"

EMPTY_THINK = re.compile(r"<think>\s*</think>\s*")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--preset", choices=sorted(PRESETS), default="27b")
    parser.add_argument("--base-model", help="Hugging Face id or local folder (overrides the preset)")
    parser.add_argument("--data", default="training/data/v2/train.jsonl")
    parser.add_argument("--eval-data", default="training/data/v2/eval.jsonl", help="'' to skip evaluation")
    parser.add_argument("--output", help="default: training/output/hanogt-<base model name>")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--max-steps", type=int, default=-1, help="stop after this many optimizer steps (smoke tests)")
    parser.add_argument("--lr", type=float, help="learning rate (preset: 1e-4 for 27B, 2e-4 for 8B)")
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, help="gradient accumulation steps (preset: 16 / 8)")
    parser.add_argument("--max-seq-len", type=int, default=8192, help="longer samples are left out, not cut")
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--no-4bit", dest="load_in_4bit", action="store_false", help="plain LoRA on bf16 weights instead of QLoRA")
    parser.add_argument("--text-only", action="store_true", help="for a vision-language base: load the language model only (less memory; the adapter then fits the text-only model)")
    parser.add_argument("--attn", default="sdpa", help="attention implementation: sdpa, flash_attention_2, eager")
    parser.add_argument("--enable-thinking", action="store_true", help="render the chat template in thinking mode (default: non-thinking, as Hanogt answers)")
    parser.add_argument("--assistant-start", default="<|im_start|>assistant\n", help="where an assistant turn starts in the rendered chat")
    parser.add_argument("--assistant-end", default="<|im_end|>", help="where it ends (learned, so the model stops)")
    parser.add_argument("--save-steps", type=int, default=200)
    parser.add_argument("--seed", type=int, default=20261003)
    parser.add_argument("--report-to", default="none", help="none, tensorboard, wandb…")
    parser.add_argument("--resume", action="store_true", help="continue from the last checkpoint in --output")
    parser.add_argument("--dry-run", action="store_true", help="tokenize the data and print the counts; no model is loaded")
    parser.add_argument("--push-to-hub", metavar="REPO", help="also upload the adapter to this Hugging Face model repository (private; needs HF_TOKEN)")
    parser.add_argument("--hub-public", action="store_true", help="create the --push-to-hub repository as public instead of private")
    parser.add_argument("--hub-checkpoints", metavar="REPO", help="upload every checkpoint to this private model repository (folder last-checkpoint), so a run cut short can continue elsewhere")
    parser.add_argument("--resume-from-hub", action="store_true", help="download last-checkpoint from --hub-checkpoints first and continue from it when there is one")
    parser.add_argument("--time-budget-hours", type=float, default=0.0, help="save a checkpoint and stop after this many hours (0: no limit); continue later with --resume-from-hub")
    parser.add_argument("--init-adapter", metavar="PATH_OR_REPO", help="start from this LoRA adapter (a folder or a model repository) instead of a new one: the next round of continued training")
    parser.add_argument("--status-file", help="write {status: finished|stopped, step, metrics} here when the run ends")
    args = parser.parse_args(argv)
    preset = PRESETS[args.preset]
    args.base_model = args.base_model or preset["base_model"]
    args.lr = args.lr if args.lr is not None else preset["lr"]
    args.grad_accum = args.grad_accum if args.grad_accum is not None else preset["grad_accum"]
    if not args.output:
        args.output = f"training/output/hanogt-{args.base_model.rstrip('/').split('/')[-1].lower()}"
    return args


def load_jsonl(path):
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def render(tokenizer, sample, enable_thinking):
    """The conversation as the chat template writes it (tools included)."""
    extra = {"tools": sample["tools"]} if sample.get("tools") else {}
    return tokenizer.apply_chat_template(sample["messages"], tokenize=False, enable_thinking=enable_thinking, **extra)


def assistant_spans(text, start_marker, end_marker):
    """Character ranges of the assistant's turns: from after the start marker to the end marker
    inclusive. An empty thinking block the template adds in non-thinking mode is skipped."""
    spans = []
    position = 0
    while True:
        index = text.find(start_marker, position)
        if index == -1:
            return spans
        begin = index + len(start_marker)
        empty = EMPTY_THINK.match(text, begin)
        if empty:
            begin = empty.end()
        end = text.find(end_marker, begin)
        end = len(text) if end == -1 else end + len(end_marker)
        spans.append((begin, end))
        position = end


def encode(tokenizer, sample, args):
    """input_ids and labels (-100 outside the assistant's turns), or None when the sample is too long."""
    text = render(tokenizer, sample, args.enable_thinking)
    spans = assistant_spans(text, args.assistant_start, args.assistant_end)
    if not spans:
        raise ValueError(
            "No assistant turn found in the rendered chat. If the base model doesn't use ChatML, pass its markers "
            "with --assistant-start and --assistant-end."
        )
    encoding = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    input_ids = encoding["input_ids"]
    if len(input_ids) > args.max_seq_len:
        return None
    labels = [-100] * len(input_ids)
    span = 0
    for index, (start, end) in enumerate(encoding["offset_mapping"]):
        while span < len(spans) and spans[span][1] <= start:
            span += 1
        if span < len(spans) and start >= spans[span][0] and end <= spans[span][1] and end > start:
            labels[index] = input_ids[index]
    return {"input_ids": input_ids, "labels": labels}


def encode_all(tokenizer, samples, args, name):
    items, too_long = [], 0
    for sample in samples:
        item = encode(tokenizer, sample, args)
        if item is None:
            too_long += 1
        else:
            items.append(item)
    tokens = sum(len(item["input_ids"]) for item in items)
    learned = sum(sum(1 for label in item["labels"] if label != -100) for item in items)
    print(f"{name}: {len(items)} samples, {tokens:,} tokens ({learned:,} learned), {too_long} longer than {args.max_seq_len} left out")
    return items, {"samples": len(items), "tokens": tokens, "learnedTokens": learned, "tooLong": too_long}


def main(argv=None):
    args = parse_args(argv)
    from transformers import AutoTokenizer

    train_samples = load_jsonl(args.data)
    eval_samples = load_jsonl(args.eval_data) if args.eval_data and os.path.exists(args.eval_data) else []
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    train_items, train_stats = encode_all(tokenizer, train_samples, args, "train")
    eval_items, eval_stats = encode_all(tokenizer, eval_samples, args, "eval") if eval_samples else ([], None)
    steps_per_epoch = math.ceil(len(train_items) / (args.batch_size * args.grad_accum))
    print(f"≈ {steps_per_epoch} optimizer steps per epoch at batch {args.batch_size} × accumulation {args.grad_accum}")
    if args.dry_run:
        return 0

    import torch
    import transformers
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoConfig, AutoModelForCausalLM, Trainer, TrainerCallback, TrainingArguments

    torch.manual_seed(args.seed)
    cuda = torch.cuda.is_available()
    bf16 = cuda and torch.cuda.is_bf16_supported()
    if args.load_in_4bit and not cuda:
        sys.exit("QLoRA (4-bit) needs an NVIDIA GPU; on a CPU or Apple machine use --no-4bit with a small model.")

    config = AutoConfig.from_pretrained(args.base_model)
    vision = getattr(config, "vision_config", None) is not None
    model_class = AutoModelForCausalLM
    if vision and not args.text_only:
        # Keep the whole vision-language model so the merged result is served exactly like the original.
        from transformers import AutoModelForImageTextToText as model_class  # noqa: N813
    major = int(transformers.__version__.split(".")[0])
    dtype = torch.bfloat16 if (bf16 or not cuda) else torch.float16
    load = {("dtype" if major >= 5 else "torch_dtype"): dtype, "attn_implementation": args.attn}
    if args.load_in_4bit:
        from transformers import BitsAndBytesConfig

        load["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=dtype,
            bnb_4bit_use_double_quant=True,
            llm_int8_skip_modules=["visual", "lm_head", "mtp"],
        )
    if cuda:
        local_rank = int(os.environ.get("LOCAL_RANK", "-1"))
        load["device_map"] = {"": local_rank} if local_rank >= 0 else "auto"
    print(f"loading {args.base_model} ({model_class.__name__}, {'4-bit QLoRA' if args.load_in_4bit else str(dtype).replace('torch.', '') + ' LoRA'})")
    model = model_class.from_pretrained(args.base_model, **load)
    model.config.use_cache = False
    if args.load_in_4bit:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})

    if args.init_adapter:
        from peft import PeftModel

        start = adapter_folder(args.init_adapter, output_root=args.output)
        print(f"continuing the adapter of {args.init_adapter}")
        model = PeftModel.from_pretrained(model, start, is_trainable=True)
    else:
        lora = LoraConfig(r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, bias="none", task_type="CAUSAL_LM", target_modules=TARGET_MODULES)
        model = get_peft_model(model, lora)
    adapted = sorted({name.split(".")[-1] for name, module in model.named_modules() if hasattr(module, "lora_A") and len(getattr(module, "lora_A", {})) > 0})
    if not adapted:
        sys.exit("LoRA found none of its target layers in this model; check the base model.")
    print(f"LoRA on: {', '.join(adapted)}")
    model.print_trainable_parameters()

    class Items(torch.utils.data.Dataset):
        def __init__(self, items):
            self.items = items

        def __len__(self):
            return len(self.items)

        def __getitem__(self, index):
            return self.items[index]

    pad = tokenizer.pad_token_id

    def collate(batch):
        width = max(len(item["input_ids"]) for item in batch)
        input_ids = torch.full((len(batch), width), pad, dtype=torch.long)
        labels = torch.full((len(batch), width), -100, dtype=torch.long)
        attention = torch.zeros((len(batch), width), dtype=torch.long)
        for row, item in enumerate(batch):
            size = len(item["input_ids"])
            input_ids[row, :size] = torch.tensor(item["input_ids"])
            labels[row, :size] = torch.tensor(item["labels"])
            attention[row, :size] = 1
        return {"input_ids": input_ids, "labels": labels, "attention_mask": attention}

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    # TrainingArguments changes between transformers releases: pass only the options this one has.
    fields = {field.name for field in dataclasses.fields(TrainingArguments)}
    options = {
        "output_dir": str(output),
        "per_device_train_batch_size": args.batch_size,
        "per_device_eval_batch_size": args.batch_size,
        "gradient_accumulation_steps": args.grad_accum,
        "learning_rate": args.lr,
        "num_train_epochs": args.epochs,
        "max_steps": args.max_steps,
        "lr_scheduler_type": "cosine",
        "warmup_steps": max(1, int(0.03 * steps_per_epoch * args.epochs)) if args.max_steps < 0 else 1,
        "logging_steps": 10 if args.max_steps < 0 or args.max_steps > 20 else 1,
        "save_strategy": "steps",
        "save_steps": args.save_steps,
        "save_total_limit": 3,
        "eval_strategy" if "eval_strategy" in fields else "evaluation_strategy": "steps" if eval_items else "no",
        "eval_steps": args.save_steps,
        "bf16": bf16,
        "fp16": cuda and not bf16,
        "gradient_checkpointing": True,
        "gradient_checkpointing_kwargs": {"use_reentrant": False},
        "optim": "paged_adamw_8bit" if args.load_in_4bit else "adamw_torch",
        "remove_unused_columns": False,
        "report_to": args.report_to,
        "seed": args.seed,
        "use_cpu": not cuda,
    }
    if int(os.environ.get("WORLD_SIZE", "1")) > 1:
        # Several GPUs (torchrun): LoRA with gradient checkpointing leaves the frozen weights without gradients.
        options["ddp_find_unused_parameters"] = False
    if args.hub_checkpoints:
        # Every save also goes to the hub (last-checkpoint), so the next session can continue.
        options.update({"push_to_hub": True, "hub_model_id": args.hub_checkpoints, "hub_strategy": "checkpoint", "hub_private_repo": True, "hub_token": os.environ.get("HF_TOKEN")})
    # Batches of similar length waste less padding.
    if "train_sampling_strategy" in fields:
        options["train_sampling_strategy"] = "group_by_length"
    elif "group_by_length" in fields:
        options["group_by_length"] = True
    skipped = sorted(key for key in options if key not in fields)
    if skipped:
        print(f"note: this transformers version has no {', '.join(skipped)}; left out")
    training = TrainingArguments(**{key: value for key, value in options.items() if key in fields})

    class TimeBudget(TrainerCallback):
        """Saves and stops once the session's time is nearly up (the next session resumes)."""

        def __init__(self, hours):
            self.deadline = time.time() + hours * 3600 if hours > 0 else None
            self.stopped = False

        def on_step_end(self, _args, _state, control, **_kwargs):
            if self.deadline is not None and time.time() >= self.deadline:
                self.stopped = True
                control.should_save = True
                control.should_training_stop = True
            return control

    budget = TimeBudget(args.time_budget_hours)
    trainer = Trainer(model=model, args=training, train_dataset=Items(train_items), eval_dataset=Items(eval_items) if eval_items else None, data_collator=collate, callbacks=[budget])
    resume = True if args.resume else None
    if args.resume_from_hub and args.hub_checkpoints:
        resume = hub_checkpoint(args.hub_checkpoints, output) or resume
    started = time.time()
    result = trainer.train(resume_from_checkpoint=resume)
    if budget.stopped:
        print(f"time budget of {args.time_budget_hours} hours reached at step {trainer.state.global_step}: the checkpoint is saved"
              + (f" and uploaded to {args.hub_checkpoints}; run again with --resume-from-hub to continue." if args.hub_checkpoints else "; run again with --resume to continue."))
        write_status(args.status_file, "stopped", trainer.state.global_step, {})
        return 0
    metrics = dict(result.metrics)
    if eval_items:
        metrics.update(trainer.evaluate())

    adapter = output / "adapter"
    trainer.model.save_pretrained(str(adapter))
    tokenizer.save_pretrained(str(adapter))
    summary = {
        "baseModel": args.base_model,
        "visionLanguage": vision,
        "textOnly": bool(args.text_only) or not vision,
        "method": "qlora-4bit" if args.load_in_4bit else "lora",
        "lora": {"r": args.lora_r, "alpha": args.lora_alpha, "dropout": args.lora_dropout, "targetModules": TARGET_MODULES, "adapted": adapted},
        "training": {"epochs": args.epochs, "maxSteps": args.max_steps, "learningRate": args.lr, "batchSize": args.batch_size, "gradientAccumulation": args.grad_accum, "maxSeqLen": args.max_seq_len, "seed": args.seed, "enableThinking": args.enable_thinking},
        "data": {"train": train_stats, "eval": eval_stats},
        "metrics": metrics,
        "minutes": round((time.time() - started) / 60, 1),
    }
    (adapter / "hanogt-training.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary["metrics"], indent=2))
    print(f"adapter saved to {adapter}")
    if args.push_to_hub:
        push_adapter(adapter, args.push_to_hub, private=not args.hub_public)
    write_status(args.status_file, "finished", trainer.state.global_step, metrics)
    return 0


def write_status(path, status, step, metrics):
    """How the run ended, for training/kaggle_run.py (only the main process writes it)."""
    if not path or int(os.environ.get("RANK", "0")) != 0:
        return
    clean = {key: value for key, value in (metrics or {}).items() if isinstance(value, (int, float, str))}
    Path(path).write_text(json.dumps({"status": status, "step": step, "metrics": clean}, indent=2) + "\n", encoding="utf-8")


def adapter_folder(source, output_root="."):
    """A local folder with adapter_config.json: `source` itself, or its download from the hub.

    With several GPUs every process downloads its own copy (no process waits for another).
    """
    if os.path.isfile(os.path.join(source, "adapter_config.json")):
        return source
    from huggingface_hub import snapshot_download

    rank = int(os.environ.get("LOCAL_RANK", "-1"))
    local = Path(output_root) / ("_init-adapter" if rank <= 0 else f"_init-adapter-rank{rank}")
    snapshot_download(repo_id=source, repo_type="model", allow_patterns=["adapter_config.json", "adapter_model.safetensors"], local_dir=str(local), token=os.environ.get("HF_TOKEN"))
    if not (local / "adapter_config.json").exists():
        sys.exit(f"{source} has no adapter_config.json to continue from")
    return str(local)


def hub_checkpoint(repo, output):
    """Downloads last-checkpoint of `repo`; its folder, or None when there is none yet.

    With several GPUs every process downloads its own copy (no process waits for another).
    """
    rank = int(os.environ.get("LOCAL_RANK", "-1"))
    # "_" folders: the trainer's checkpoint uploads skip them.
    local = Path(output) / ("_hub" if rank <= 0 else f"_hub-rank{rank}")
    try:
        from huggingface_hub import snapshot_download

        snapshot_download(repo_id=repo, repo_type="model", allow_patterns=["last-checkpoint/*"], local_dir=str(local), token=os.environ.get("HF_TOKEN"))
    except Exception as error:  # no repository or no checkpoint yet: start from the beginning
        print(f"no checkpoint to continue from in {repo} ({type(error).__name__})")
        return None
    folder = local / "last-checkpoint"
    if (folder / "trainer_state.json").exists():
        print(f"continuing from {folder}")
        return str(folder)
    return None


def push_adapter(adapter, repo, private=True):
    """Uploads the adapter folder (weights, tokenizer, hanogt-training.json) to a model repository."""
    from huggingface_hub import HfApi

    api = HfApi(token=os.environ.get("HF_TOKEN"))
    api.create_repo(repo, repo_type="model", private=private, exist_ok=True)
    api.upload_folder(repo_id=repo, repo_type="model", folder_path=str(adapter), commit_message="Hanogt AI LoRA adapter")
    print(f"adapter uploaded to https://huggingface.co/{repo}")


if __name__ == "__main__":
    sys.exit(main())
