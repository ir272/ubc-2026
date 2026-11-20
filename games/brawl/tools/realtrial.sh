#!/bin/sh
# Real-model trial: waits for OpenRouter credit (one tiny probe call every 30 min), then runs 20
# real matches, four at a time, inside the BRAWL_BUDGET_USD cap, and writes a summary.
# Usage: sh tools/realtrial.sh   (logs under .cache/real/)
cd "$(dirname "$0")/.." || exit 1
mkdir -p .cache/real
KEY=$(grep -E '^OPENROUTER_API_KEY=' .env | head -1 | cut -d= -f2-)
probe() {
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
    -d '{"model":"qwen/qwen3.7-flash","max_tokens":1,"messages":[{"role":"user","content":"ok"}]}')
  echo "$(date '+%H:%M') probe $code" >> .cache/real/probe.log
  [ "$code" = "200" ]
}
until probe; do sleep 1800; done
echo "$(date '+%H:%M') credit ok, starting trial" >> .cache/real/probe.log
PAIRS="marlow,juniper osric,pell wren,brick marlow,osric juniper,pell wren,marlow brick,juniper osric,wren pell,brick marlow,pell juniper,osric brick,marlow wren,juniper pell,wren osric,brick marlow,brick juniper,wren pell,osric brick,pell osric,marlow"
n=0
for pair in $PAIRS; do
  n=$((n+1))
  node tools/match.mjs --real --bots "$pair" > ".cache/real/trial-$n-$pair.log" 2>&1 &
  if [ $((n % 4)) -eq 0 ]; then wait; fi
done
wait
python3 tools/realsummary.py > .cache/real/summary.txt 2>&1
echo "$(date '+%H:%M') trial done" >> .cache/real/probe.log
