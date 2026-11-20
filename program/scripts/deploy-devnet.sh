#!/usr/bin/env bash
# Deploy (or upgrade) the Arena program to devnet with the dedicated admin key, initialize it,
# write DEPLOYED.json, rebuild the SDK (which embeds DEPLOYED.json), then run the e2e script.
# Usage: scripts/deploy-devnet.sh            (CLUSTER=localnet RPC_URL=... to rehearse locally)
# Needs ~2.5 SOL on the admin key (program data rent is ~1.78 SOL; e2e uses ~0.07 SOL).
set -euo pipefail
cd "$(dirname "$0")/.."

SOLANA_BIN="$HOME/.local/share/solana/install/releases/4.2.2/solana-release/bin"
[ -d "$SOLANA_BIN" ] && export PATH="$SOLANA_BIN:$PATH"

export CLUSTER="${CLUSTER:-devnet}"
case "$CLUSTER" in
  devnet) URL="${RPC_URL:-https://api.devnet.solana.com}" ;;
  localnet) URL="${RPC_URL:-http://127.0.0.1:8899}" ;;
  *) echo "only devnet/localnet"; exit 1 ;;
esac
export RPC_URL="$URL"

ADMIN=.keys/admin.json
PROGRAM_KEY=.keys/program.json
echo "admin:   $(solana-keygen pubkey $ADMIN)"
echo "program: $(solana-keygen pubkey $PROGRAM_KEY)"
echo "balance: $(solana balance -u "$URL" -k $ADMIN)"

if [ ! -f target/deploy/arena.so ]; then
  anchor build
fi

solana program deploy target/deploy/arena.so \
  -u "$URL" \
  --keypair "$ADMIN" \
  --program-id "$PROGRAM_KEY" \
  --upgrade-authority "$ADMIN"

npx tsx scripts/init.ts
npm --prefix sdk run build
[ "${SKIP_E2E:-0}" = "1" ] || npx tsx scripts/e2e-devnet.ts
