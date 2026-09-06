#!/usr/bin/env bash
#
# Checks the whole BiodiversityOS deployment and shouts if something is wrong.
#
# This exists because the two worst failures so far were both silent: the
# indexer looped forever without advancing, and the frontend rendered an empty
# map because a DNS lookup failed inside a container. Both served HTTP 200
# throughout. Checking that a port answers is therefore not enough — each check
# below asserts something about the data.
#
# Install as a systemd timer (see ops/monitor.timer) or from cron:
#   */5 * * * * /opt/biodiversityos/ops/monitor.sh
#
# Set ALERT_WEBHOOK to receive failures somewhere you actually read.
set -uo pipefail

INDEXER_INTERNAL=${INDEXER_INTERNAL:-http://127.0.0.1:4000}
BACKEND_INTERNAL=${BACKEND_INTERNAL:-http://127.0.0.1:3000}
APP_URL=${APP_URL:-https://app.biodiversityos.org}
LANDING_URL=${LANDING_URL:-https://biodiversityos.org}
RPC_URL=${RPC_URL:-https://forno.celo-sepolia.celo-testnet.org}
REGISTRY=${REGISTRY:-0x44c2f207f004a562053b7e34f6baa4a50608c8dc}
ALERT_WEBHOOK=${ALERT_WEBHOOK:-}

problems=()
note() { echo "  $*"; }
fail() { problems+=("$1"); echo "  FAIL: $1"; }

echo "== $(date -Is) =="

# ── Indexer: is it actually keeping up, not merely listening? ─────────────────
health=$(curl -s -m 10 "$INDEXER_INTERNAL/health" 2>/dev/null)
if [ -z "$health" ]; then
  fail "indexer /health did not respond"
else
  ok=$(echo "$health" | grep -o '"ok":[a-z]*' | cut -d: -f2)
  records=$(echo "$health" | grep -o '"records":[0-9]*' | cut -d: -f2)
  lastblock=$(echo "$health" | grep -o '"lastBlock":"[0-9]*"' | grep -o '[0-9]*')
  [ "$ok" = "true" ] || fail "indexer unhealthy: $(echo "$health" | grep -o '"reason":"[^"]*"')"
  note "indexer: $records records, lastBlock $lastblock"

  # An empty index is the failure the map cannot distinguish from "no data yet".
  [ "${records:-0}" -gt 0 ] || fail "indexer has 0 records"

  # Falling behind the chain is the failure that looks like nothing at all.
  head=$(curl -s -m 10 -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$RPC_URL" \
    | grep -o '"result":"0x[0-9a-f]*"' | grep -o '0x[0-9a-f]*')
  if [ -n "$head" ] && [ -n "${lastblock:-}" ]; then
    behind=$(( $((head)) - lastblock ))
    note "chain head $((head)), behind by $behind blocks"
    [ "$behind" -lt 500 ] || fail "indexer is $behind blocks behind the chain"
  else
    note "could not read chain head (RPC)"
  fi
fi

# ── On-chain record count must match what is indexed ─────────────────────────
onchain=$(curl -s -m 10 -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$REGISTRY\",\"data\":\"0xdbde207d\"},\"latest\"],\"id\":1}" \
  "$RPC_URL" | grep -o '"result":"0x[0-9a-f]*"' | grep -o '0x[0-9a-f]*')
if [ -n "$onchain" ] && [ -n "${records:-}" ]; then
  expected=$(( $((onchain)) - 1 ))
  note "on chain: $expected records"
  # Voided records legitimately reduce the indexed count, so only flag a shortfall
  # large enough to mean the indexer missed something.
  [ "$((expected - records))" -lt 5 ] || fail "indexed $records but chain has $expected"
fi

# ── Backend ──────────────────────────────────────────────────────────────────
curl -sf -m 10 "$BACKEND_INTERNAL/health" >/dev/null || fail "backend /health failed"

# ── Frontends must render real data, not just return 200 ─────────────────────
app_html=$(curl -s -m 25 "$APP_URL")
if ! echo "$app_html" | grep -q "sightings"; then
  fail "app did not render the sightings panel"
elif echo "$app_html" | grep -qE 'mb-4">0<'; then
  fail "app rendered 0 sightings — indexer unreachable from the app container?"
fi
curl -sf -m 20 -o /dev/null "$LANDING_URL" || fail "landing did not respond"

# ── Containers ───────────────────────────────────────────────────────────────
if command -v docker >/dev/null; then
  unhealthy=$(docker ps --filter health=unhealthy --format '{{.Names}}' | tr '\n' ' ')
  [ -z "$unhealthy" ] || fail "unhealthy containers: $unhealthy"
  for c in app-app-1 landing-app-1 backend-app-1 indexer-app-1 indexer-db-1; do
    docker ps --format '{{.Names}}' | grep -qx "$c" || fail "container $c is not running"
  done
fi

# ── Certificate ──────────────────────────────────────────────────────────────
days=$(echo | openssl s_client -servername app.biodiversityos.org \
  -connect app.biodiversityos.org:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null \
  | cut -d= -f2)
if [ -n "$days" ]; then
  left=$(( ( $(date -d "$days" +%s) - $(date +%s) ) / 86400 ))
  note "certificate: $left days left"
  [ "$left" -gt 14 ] || fail "certificate expires in $left days"
fi

# ── Result ───────────────────────────────────────────────────────────────────
if [ ${#problems[@]} -eq 0 ]; then
  echo "  all checks passed"
  exit 0
fi

message="BiodiversityOS: ${#problems[@]} problem(s) on $(hostname)
$(printf ' - %s\n' "${problems[@]}")"
echo "$message" | systemd-cat -t bos-monitor -p err 2>/dev/null || true

if [ -n "$ALERT_WEBHOOK" ]; then
  curl -s -m 10 -X POST -H 'Content-Type: application/json' \
    -d "$(printf '{"text":%s}' "$(printf '%s' "$message" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
    "$ALERT_WEBHOOK" >/dev/null || echo "  (webhook delivery failed)"
fi
exit 1
