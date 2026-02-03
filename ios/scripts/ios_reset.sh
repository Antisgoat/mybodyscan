#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

npm run build:web
npx cap sync ios
(cd ios/App && pod install --repo-update)
open ios/App/App.xcworkspace
