# Hanogt Security Bot — guard evaluation

Generated: 2026-10-01T13:12:58.960Z

The guard in `src/lib/security/signatures.ts` is a high-confidence abuse
guardrail for untrusted code (the runner, Media posts, Arcade publishing).
It is not a sandbox or a malware verdict; this report measures whether it
still catches the categories it claims to, without blocking ordinary code.

## Summary

- Signatures defined: **16**
- Recall fixtures: **16** → detected & blocked **100.0%**
- Signatures without a recall fixture: **0**
- Benign samples: **34** → allowed **100.0%**
- Benign samples wrongly blocked (false positives): **0**
- Benign samples with a non-blocking finding: **1**

## Recall gaps

_None — every recall fixture is detected and blocked._

## False positives (benign code blocked)

_None — every benign sample is allowed._

## Benign code with a non-blocking finding

- `download-then-convert` (near `network-process-chain`) → noted: network-process-chain
