#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PROJECT_ID=mybodyscan-f3daf REGION=us-central1 ./ops/attach-secrets.sh
# Requires: gcloud, firebase-tools, jq

PROJECT_ID="${PROJECT_ID:-mybodyscan-f3daf}"
REGION="${REGION:-us-central1}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need gcloud
need firebase
need jq

echo "=== MyBodyScan secret audit ==="
echo "Project: $PROJECT_ID"
echo "Region : $REGION"
echo

# Secrets we expect in Secret Manager
SECRETS=(OPENAI_API_KEY STRIPE_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET USDA_FDC_API_KEY)

for S in "${SECRETS[@]}"; do
  echo "--- Secret: $S"
  if firebase functions:secrets:versions:list "$S" --project "$PROJECT_ID" >/dev/null 2>&1; then
    latest="$(firebase functions:secrets:versions:list "$S" --project "$PROJECT_ID" --json | jq -r '.result.versions[0].version // "unknown"')"
    echo "exists: yes (latest version: $latest)"
  else
    echo "exists: NO"
    echo "set it with:"
    echo "firebase functions:secrets:set $S --project $PROJECT_ID"
  fi
  echo
done

check_attach() {
  local fn="$1"
  echo ">>> Function attachments: $fn"
  gcloud functions describe "$fn" \
    --gen2 --region="$REGION" --project="$PROJECT_ID" --format=json \
    | jq -r '.serviceConfig.secretEnvironmentVariables // [] | map("\(.key)=\(.secret):\(.version)") | .[]?'
  echo
}

check_attach coachChat
check_attach createCheckout
check_attach nutritionSearch

echo "=== Suggested attach commands (dry-run; COPY and run manually) ==="
echo "To attach OPENAI to coachChat:"
echo "gcloud functions deploy coachChat --gen2 --region=$REGION --project=$PROJECT_ID --runtime=nodejs20 --source=functions --entry-point=coachChat --update-secrets=OPENAI_API_KEY=OPENAI_API_KEY:latest"
echo
echo "To attach STRIPE to createCheckout (accepts either STRIPE_SECRET or STRIPE_SECRET_KEY):"
echo "gcloud functions deploy createCheckout --gen2 --region=$REGION --project=$PROJECT_ID --runtime=nodejs20 --source=functions --entry-point=createCheckout --update-secrets=STRIPE_SECRET=STRIPE_SECRET:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest"
echo
echo "To attach USDA key to nutritionSearch:"
echo "gcloud functions deploy nutritionSearch --gen2 --region=$REGION --project=$PROJECT_ID --runtime=nodejs20 --source=functions --entry-point=nutritionSearch --update-secrets=USDA_FDC_API_KEY=USDA_FDC_API_KEY:latest"
echo
echo "Webhook secret is used by stripeWebhook; if missing, attach similarly with --update-secrets=STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest"
echo
echo "Done."

# end of file
