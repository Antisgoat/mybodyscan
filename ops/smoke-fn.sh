#!/usr/bin/env bash
set -euo pipefail

C="https://coachchat-534gpapj7q-uc.a.run.app"
N="https://nutritionsearch-534gpapj7q-uc.a.run.app"
H="https://systemhealth-534gpapj7q-uc.a.run.app"

echo "coachChat (no appcheck) => expect normal payload (not app_check_required)"
curl -sS -X POST "$C" -H "Content-Type: application/json" -d '{"message":"ping"}' | sed 's/^/RESPONSE: /'
echo

echo "nutritionSearch (no appcheck) => expect normal payload (not app_check_required)"
curl -sS -X POST "$N" -H "Content-Type: application/json" -d '{"q":"chicken breast"}' | sed 's/^/RESPONSE: /'
echo

echo "systemHealth snapshot"
curl -sS "$H" | sed 's/^/RESPONSE: /'
echo
