#!/bin/bash
set -euo pipefail
URL="$1"
curl -sI "$URL" | tr -d '\r' | grep -iE 'strict-transport-security|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|content-security-policy'
