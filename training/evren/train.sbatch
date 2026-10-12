#!/bin/bash
# Hanogt AI training on a Slurm + Apptainer cluster (for example EVREN's H200 nodes).
# Same pipeline as Kaggle (training/kaggle_run.py): data refresh, then training rounds
# that resume from the private Hugging Face repositories. Read training/evren/README.md first.
#
#   export HF_TOKEN=...          # from the cluster's secret store or your shell; never in a file
#   sbatch training/evren/train.sbatch
#
# Override with environment variables: BASE_MODEL, GPUS (also change --gres), HOURS, SIF, WORK.
#SBATCH --job-name=hanogt-ai
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=16
#SBATCH --mem=192G
#SBATCH --time=12:00:00
#SBATCH --output=hanogt-ai-%j.log
set -euo pipefail

: "${HF_TOKEN:?Set HF_TOKEN (write access to the private Hanogt repositories) in the job environment, not in a file.}"
REPO="${SLURM_SUBMIT_DIR:-$PWD}"
SIF="${SIF:-$REPO/hanogt-train.sif}"
# One H200 (141 GB) trains the 27B base with 16-bit LoRA; Qwen/Qwen3.5-9B or -4B need far less.
BASE_MODEL="${BASE_MODEL:-Qwen/Qwen3.8-27B}"
# Leave time to upload the last checkpoint before Slurm stops the job.
HOURS="${HOURS:-11.5}"
WORK="${WORK:-${TMPDIR:-/tmp}/hanogt-${SLURM_JOB_ID:-local}}"
mkdir -p "$WORK"

if [ ! -f "$REPO/training/kaggle_run.py" ]; then
    echo "Submit the job from the repository's root (training/kaggle_run.py not found in $REPO)." >&2
    exit 1
fi
if [ ! -f "$SIF" ]; then
    echo "Container not found: $SIF (apptainer build hanogt-train.sif training/evren/hanogt-train.def)" >&2
    exit 1
fi

echo "Hanogt AI: $BASE_MODEL, ${HOURS} h, GPUs: ${SLURM_GPUS_ON_NODE:-?}, work folder $WORK"
nvidia-smi --query-gpu=name,memory.total --format=csv || true

# HF_TOKEN reaches the container through the environment (Apptainer passes it on); it never
# appears on a command line.
apptainer exec --nv --pwd "$REPO" --bind "$REPO" --bind "$WORK" "$SIF" \
    python3 training/kaggle_run.py \
        --base-model "$BASE_MODEL" \
        --hours "$HOURS" \
        --work "$WORK"
