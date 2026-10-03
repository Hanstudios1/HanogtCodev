#!/usr/bin/env python3
"""Merge a LoRA adapter from train_lora.py into its base model and export it.

  python training/merge_and_export.py --adapter training/output/hanogt-qwen3.6-27b/adapter
  python training/merge_and_export.py --adapter … --llama-cpp ~/llama.cpp --gguf-type q8_0 --quantize Q4_K_M

The base model and whether it was loaded text-only come from the adapter's
hanogt-training.json. The merged model (bf16 safetensors) goes to --output;
with --llama-cpp it is also converted to GGUF (and optionally quantized) and
an Ollama Modelfile is written next to it. The base is loaded in bf16 (not
4-bit) so the merge doesn't lose precision: this needs about twice the
model's size in parameters of RAM (≈ 60 GB for 27B; a CPU machine is fine).
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--adapter", required=True, help="the adapter folder train_lora.py wrote")
    parser.add_argument("--base-model", help="default: the one in hanogt-training.json")
    parser.add_argument("--output", help="default: <adapter>/../merged")
    parser.add_argument("--name", default="hanogt-ai", help="model name for the GGUF file and Ollama")
    parser.add_argument("--dtype", choices=["bf16", "fp16"], default="bf16")
    parser.add_argument("--llama-cpp", help="a llama.cpp checkout (with convert_hf_to_gguf.py) to also write GGUF")
    parser.add_argument("--gguf-type", default="q8_0", help="convert_hf_to_gguf.py --outtype: f16, bf16, q8_0…")
    parser.add_argument("--quantize", help="also run llama-quantize to this type, e.g. Q4_K_M")
    parser.add_argument("--context", type=int, default=32768, help="num_ctx in the Ollama Modelfile")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    adapter = Path(args.adapter)
    info_file = adapter / "hanogt-training.json"
    info = json.loads(info_file.read_text(encoding="utf-8")) if info_file.exists() else {}
    base_model = args.base_model or info.get("baseModel")
    if not base_model:
        sys.exit("No base model: pass --base-model (hanogt-training.json is missing).")
    output = Path(args.output) if args.output else adapter.parent / "merged"

    import torch
    import transformers
    from peft import PeftModel
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

    dtype = torch.bfloat16 if args.dtype == "bf16" else torch.float16
    major = int(transformers.__version__.split(".")[0])
    config = AutoConfig.from_pretrained(base_model)
    vision = getattr(config, "vision_config", None) is not None
    model_class = AutoModelForCausalLM
    if vision and not info.get("textOnly", False):
        from transformers import AutoModelForImageTextToText as model_class  # noqa: N813
    print(f"loading {base_model} ({model_class.__name__}, {args.dtype}) and the adapter {adapter}")
    base = model_class.from_pretrained(base_model, **{("dtype" if major >= 5 else "torch_dtype"): dtype}, low_cpu_mem_usage=True)
    merged = PeftModel.from_pretrained(base, str(adapter)).merge_and_unload()
    output.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(output), safe_serialization=True, max_shard_size="5GB")
    tokenizer = AutoTokenizer.from_pretrained(str(adapter) if (adapter / "tokenizer_config.json").exists() else base_model)
    tokenizer.save_pretrained(str(output))
    if vision and model_class is not AutoModelForCausalLM:
        # The image preprocessor settings, so the merged model still takes images.
        try:
            from transformers import AutoProcessor

            AutoProcessor.from_pretrained(base_model).save_pretrained(str(output))
        except Exception as error:  # noqa: BLE001 - optional; the text model works without it
            print(f"note: the processor wasn't copied ({error})")
    print(f"merged model saved to {output}")

    if args.llama_cpp:
        llama = Path(args.llama_cpp).expanduser()
        convert = llama / "convert_hf_to_gguf.py"
        if not convert.exists():
            sys.exit(f"{convert} not found: clone https://github.com/ggml-org/llama.cpp and install its requirements")
        gguf = output / f"{args.name}-{args.gguf_type}.gguf"
        subprocess.run([sys.executable, str(convert), str(output), "--outfile", str(gguf), "--outtype", args.gguf_type], check=True)
        final = gguf
        if args.quantize:
            binary = shutil.which("llama-quantize") or next((str(path) for path in llama.glob("build/bin/llama-quantize*")), None)
            if not binary:
                sys.exit("llama-quantize not found: build llama.cpp (cmake -B build && cmake --build build) or put it on PATH")
            final = output / f"{args.name}-{args.quantize.lower()}.gguf"
            subprocess.run([binary, str(gguf), str(final), args.quantize], check=True)
        modelfile = output / "Modelfile"
        modelfile.write_text(
            f"FROM ./{final.name}\n"
            f"PARAMETER num_ctx {args.context}\n"
            "PARAMETER temperature 0.6\n"
            "PARAMETER top_p 0.95\n",
            encoding="utf-8",
        )
        print(f"GGUF: {final}\nOllama: cd {output} && ollama create {args.name} -f Modelfile")

    print(
        "\nServe with vLLM (OpenAI-compatible, for HANOGT_AI_BASE_URL):\n"
        f"  vllm serve {output} --served-model-name {args.name} --max-model-len {args.context}\n"
        "Add the reasoning and tool-call parser flags the base model's card recommends (see training/README.md)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
