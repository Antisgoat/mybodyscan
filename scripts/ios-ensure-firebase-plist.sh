#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

src="$repo_root/secrets/GoogleService-Info.plist"
dest="$repo_root/ios/App/App/GoogleService-Info.plist"
dest_dir="$(dirname "$dest")"

if [[ ! -f "$src" ]]; then
  cat >&2 <<'EOF'
error: Missing secrets/GoogleService-Info.plist

FirebaseApp.configure() requires an iOS Firebase config plist named exactly:
  GoogleService-Info.plist

Fix:
  1) Firebase Console -> Project settings -> Your apps -> iOS
  2) Download GoogleService-Info.plist
  3) Save it to:
       ./secrets/GoogleService-Info.plist
  4) Re-run:
       bash scripts/ios-ensure-firebase-plist.sh
EOF
  exit 1
fi

mkdir -p "$dest_dir"
cp -f "$src" "$dest"

# Remove any misnamed variants so only one exists.
shopt -s nullglob
for f in "$dest_dir"/GoogleService-Info*; do
  [[ "$f" == "$dest" ]] && continue
  if [[ -f "$f" ]]; then
    rm -f "$f"
  fi
done
shopt -u nullglob

echo "OK: ensured ios/App/App/GoogleService-Info.plist"
