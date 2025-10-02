#!/usr/bin/env bash
set -euo pipefail

npx tsc -p tsconfig.json --noEmit
npm run build
npm --prefix functions run build

if rg -n "SAMPLE FOODS" src/lib/nutrition src/pages/Meals >/dev/null 2>&1; then
  echo "Found forbidden mock string: SAMPLE FOODS" >&2
  exit 1
fi

if rg -n "(USDA Mock)" src/lib/nutrition src/pages/Meals >/dev/null 2>&1; then
  echo "Found forbidden mock string: (USDA Mock)" >&2
  exit 1
fi

if rg -n "(OFF Mock)" src/lib/nutrition src/pages/Meals >/dev/null 2>&1; then
  echo "Found forbidden mock string: (OFF Mock)" >&2
  exit 1
fi

if rg -n "mock" src/lib/nutrition src/pages/Meals >/dev/null 2>&1; then
  echo "Found forbidden mock references" >&2
  exit 1
fi

echo "QA PASS"
