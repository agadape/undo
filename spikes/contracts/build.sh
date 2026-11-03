#!/usr/bin/env bash
# Build spike contracts inside WSL. Target dir lives in the Linux home for speed.
set -uo pipefail
source "$HOME/.cargo/env"
cd "$(dirname "$0")"
export CARGO_TARGET_DIR="$HOME/nh-target"
mkdir -p wasm
for c in "${@:-ft nft mt}"; do
  for name in $c; do
    echo "===== build $name"
    s=$(date +%s)
    cargo near build non-reproducible-wasm --manifest-path "$name/Cargo.toml" --out-dir wasm 2>&1 \
      | grep -vE '^\s+(Compiling|Downloaded|Downloading|Checking|Fresh|Locking|Adding)' | tail -30
    echo "exit=${PIPESTATUS[0]} took=$(( $(date +%s) - s ))s"
  done
done
ls -la wasm
rustc --version
