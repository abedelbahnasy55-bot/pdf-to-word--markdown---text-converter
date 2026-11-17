#!/usr/bin/env bash
set -euo pipefail

# Deploy the PDF & Word Studio publicly on Google Cloud Run with zero cold-start sleep
# Usage:
#   export GEMINI_API_KEY="your-key"
#   export TEAM_ACCESS_CODE="TEAM-2026"   # Optional simple team passcode
#   bash deploy-cloudrun.sh [SERVICE_NAME] [REGION]

SERVICE_NAME="${1:-doc-studio-team}"
REGION="${2:-europe-west2}"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "Error: GEMINI_API_KEY environment variable is required."
  exit 1
fi

ENV_VARS="NODE_ENV=production"
if [ -n "${TEAM_ACCESS_CODE:-}" ]; then
  ENV_VARS="${ENV_VARS},TEAM_ACCESS_CODE=${TEAM_ACCESS_CODE}"
fi

echo "Deploying ${SERVICE_NAME} to Google Cloud Run (${REGION})..."
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 1 \
  --max-instances 3 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --set-env-vars "${ENV_VARS},GEMINI_API_KEY=${GEMINI_API_KEY}"

echo "Deployment complete. Public service URL:"
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format="value(status.url)"
