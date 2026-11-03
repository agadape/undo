#!/usr/bin/env bash
# Build (and optionally test) the Undo contracts inside WSL.
#   bash build.sh          -> wasm into ./wasm
#   bash build.sh test     -> run unit tests
set -uo pipefail
source "$HOME/.cargo/env"
cd "$(dirname "$0")"
export CARGO_TARGET_DIR="$HOME/nh-target"
if [ "${1:-}" = "test" ]; then
  s=$(date +%s)
  cargo test --manifest-path undo-token/Cargo.toml 2>&1 \
    | grep -vE '^\s+(Compiling|Downloaded|Downloading|Checking|Fresh|Locking|Adding)' | tail -40
  echo "exit=${PIPESTATUS[0]} took=$(( $(date +%s) - s ))s"
  exit 0
fi
mkdir -p wasm
s=$(date +%s)
cargo near build non-reproducible-wasm --manifest-path undo-token/Cargo.toml --out-dir wasm 2>&1 \
  | grep -vE '^\s+(Compiling|Downloaded|Downloading|Checking|Fresh|Locking|Adding)' | tail -40
echo "exit=${PIPESTATUS[0]} took=$(( $(date +%s) - s ))s"
ls -la wasm
