#!/usr/bin/env bash
set -euo pipefail

gcloud services enable \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firebaserules.googleapis.com

PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format="value(projectNumber)")

gcloud projects add-iam-policy-binding "$(gcloud config get-value project)" \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-eventarc.iam.gserviceaccount.com" \
  --role="roles/eventarc.serviceAgent"

gcloud projects add-iam-policy-binding "$(gcloud config get-value project)" \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-eventarc.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

echo "Eventarc IAM configured. Redeploy Firestore trigger with:"
echo "  firebase deploy --only functions:processQueuedScan"
