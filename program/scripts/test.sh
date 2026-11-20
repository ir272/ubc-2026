#!/usr/bin/env bash
# Local tests: builds, starts a local validator with the program, runs tests/arena.test.ts.
set -euo pipefail
cd "$(dirname "$0")/.."
SOLANA_BIN="$HOME/.local/share/solana/install/releases/4.2.2/solana-release/bin"
[ -d "$SOLANA_BIN" ] && export PATH="$SOLANA_BIN:$PATH"
npm --prefix sdk run build >/dev/null
exec "$HOME/.avm/bin/anchor-0.32.1" test "$@"
