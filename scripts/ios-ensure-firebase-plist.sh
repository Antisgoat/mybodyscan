#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

src="$repo_root/secrets/GoogleService-Info.plist"
dest="$repo_root/ios/App/App/GoogleService-Info.plist"
dest_dir="$(dirname "$dest")"

cleanup_dest_dir() {
  # Remove any misnamed variants so only one exists in the Xcode project folder.
  shopt -s nullglob
  for f in "$dest_dir"/GoogleService-Info*; do
    [[ "$f" == "$dest" ]] && continue
    if [[ -f "$f" ]]; then
      rm -f "$f"
    fi
  done
  shopt -u nullglob
}

# If we have a source-of-truth secrets plist, ALWAYS copy it into the iOS app folder.
# This ensures CI / local setups can inject the real plist even if the repo contains
# a template file at the destination path.
if [[ -f "$src" ]]; then
  mkdir -p "$dest_dir"
  cp -f "$src" "$dest"
  cleanup_dest_dir
  echo "OK: ensured ios/App/App/GoogleService-Info.plist (from ./secrets)"
  exit 0
fi

# If we don't have ./secrets, allow using an existing plist in the iOS app folder.
# (Common for local/dev setups where the plist is placed directly in Xcode.)
if [[ -f "$dest" ]]; then
  cleanup_dest_dir
  echo "OK: ensured ios/App/App/GoogleService-Info.plist (existing file)"
  exit 0
fi

if [[ ! -f "$src" ]]; then
  # Developers commonly end up with a misnamed Firebase download (e.g. "GoogleService-Info-2.plist"
  # or "GoogleService-Info (1).plist"). If there's exactly one plausible candidate, accept it.
  shopt -s nullglob nocaseglob
  candidates=("$repo_root/secrets"/GoogleService-Info*.plist)
  shopt -u nocaseglob

  if [[ ${#candidates[@]} -eq 1 ]]; then
    echo "warn: Found Firebase plist at: ${candidates[0]}" >&2
    echo "warn: Copying it to ./secrets/GoogleService-Info.plist" >&2
    mkdir -p "$(dirname "$src")"
    cp -f "${candidates[0]}" "$src"
  else
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
    if [[ ${#candidates[@]} -gt 1 ]]; then
      echo >&2
      echo "Found multiple candidates in ./secrets; keep exactly one:" >&2
      for c in "${candidates[@]}"; do
        echo "  - $c" >&2
      done
    fi
    exit 1
  fi
fi

mkdir -p "$dest_dir"
cp -f "$src" "$dest"

cleanup_dest_dir

echo "OK: ensured ios/App/App/GoogleService-Info.plist"
