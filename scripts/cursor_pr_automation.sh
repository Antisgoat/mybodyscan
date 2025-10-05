#!/usr/bin/env bash
set -euo pipefail

readonly BASE_BRANCH="main"
readonly TITLE="test: verify Cursor PR creation"
readonly BODY="Testing Cursor PR creation automation."

log() {
  printf '[cursor-pr] %s\n' "$*"
}

err() {
  printf '[cursor-pr][error] %s\n' "$*" >&2
}

shell_init_file() {
  local shell_path
  shell_path=${SHELL:-}
  case "${shell_path}" in
    */zsh)
      printf '%s/.zshrc' "${ZDOTDIR:-$HOME}"
      ;;
    */bash)
      if [[ -f "$HOME/.bash_profile" ]]; then
        printf '%s/.bash_profile' "$HOME"
      elif [[ -f "$HOME/.bash_login" ]]; then
        printf '%s/.bash_login' "$HOME"
      elif [[ -f "$HOME/.profile" ]]; then
        printf '%s/.profile' "$HOME"
      else
        printf '%s/.bash_profile' "$HOME"
      fi
      ;;
    *)
      printf '%s/.profile' "$HOME"
      ;;
  esac
}

ensure_homebrew_path() {
  local init_file path_entry
  init_file=$(shell_init_file)
  path_entry='export PATH="/opt/homebrew/bin:$PATH"'

  if [[ ! -d /opt/homebrew/bin ]]; then
    log "Homebrew path /opt/homebrew/bin not found on this system; skipping PATH update."
    return
  fi

  mkdir -p "$(dirname "$init_file")"
  if [[ -f "$init_file" ]] && grep -Fq "/opt/homebrew/bin" "$init_file"; then
    log "Homebrew path already present in ${init_file}."
  else
    log "Adding /opt/homebrew/bin to PATH inside ${init_file}."
    {
      printf '\n# Added by scripts/cursor_pr_automation.sh to expose GitHub CLI for Cursor\n'
      printf '%s\n' "$path_entry"
    } >> "$init_file"
  fi

  # shellcheck disable=SC1090
  source "$init_file" || true
}

ensure_gh_in_path() {
  if command -v gh >/dev/null 2>&1; then
    log "GitHub CLI already available as $(command -v gh)."
    return 0
  fi

  ensure_homebrew_path

  if command -v gh >/dev/null 2>&1; then
    log "GitHub CLI found after PATH update: $(command -v gh)."
    return 0
  fi

  err "GitHub CLI (gh) not found even after updating PATH. Install it with Homebrew (brew install gh) or make sure it is on the PATH."
  return 1
}

ensure_gh_authenticated() {
  if gh auth status -h github.com >/dev/null 2>&1; then
    log "GitHub CLI already authenticated for github.com."
    return 0
  fi

  log "Authenticating GitHub CLI for github.com with repo,workflow,read:org scopes."
  gh auth login -h github.com -s repo,workflow,read:org --web
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

checkout_branch() {
  local branch
  branch=$1
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    git checkout "$branch"
  else
    git checkout -b "$branch"
  fi
}

create_test_file() {
  local file
  file="tests/cursor-pr-environment.md"
  mkdir -p "$(dirname "$file")"
  cat <<FILE_CONTENT > "$file"
# Cursor Pull Request Environment Check

- Generated at: $(date -Iseconds)
- PATH: \`\$PATH\`
- gh location: \`$(command -v gh || echo "gh not found")\`

This file confirms that the automation script successfully created a test branch and staged content.
FILE_CONTENT
}

commit_test_file() {
  git add tests/cursor-pr-environment.md
  if git diff --cached --quiet; then
    log "No staged changes to commit."
    return 1
  fi
  git commit -m "test: add cursor PR environment check"
}

push_branch() {
  local branch
  branch=$1
  git push -u origin "$branch"
}

parse_owner_repo() {
  local remote url regex
  remote=${1:-origin}
  url=$(git remote get-url "$remote")
  regex='github.com[:/](.+)/([^/]+?)(\\.git)?$'
  if [[ $url =~ $regex ]]; then
    printf '%s %s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi
  err "Unable to parse owner/repo from remote URL: $url"
  return 1
}

create_pr_with_gh() {
  local branch=$1
  if gh pr create --base "$BASE_BRANCH" --head "$branch" --title "$TITLE" --body "$BODY"; then
    return 0
  fi
  return 1
}

create_pr_with_api() {
  local branch=$1 owner repo token api_url payload response pr_url
  read -r owner repo < <(parse_owner_repo origin)
  token=$(gh auth token 2>/dev/null || true)
  if [[ -z ${token} ]]; then
    token=${GITHUB_TOKEN:-}
  fi
  if [[ -z ${token} ]]; then
    err "No GitHub token available for API fallback. Set GITHUB_TOKEN or authenticate gh."
    return 1
  fi

  api_url="https://api.github.com/repos/${owner}/${repo}/pulls"
  payload=$(cat <<JSON
{
  "title": "${TITLE//"/\"}",
  "head": "${branch//"/\"}",
  "base": "${BASE_BRANCH//"/\"}",
  "body": "${BODY//"/\"}"
}
JSON
  )

  response=$(curl -sS -X POST "$api_url" -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github+json" -d "$payload")

  pr_url=$(python3 - <<'PY'
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError as exc:
    sys.stderr.write(f'Failed to parse GitHub API response: {exc}\n')
    sys.exit(1)
if 'html_url' in data:
    print(data['html_url'])
    sys.exit(0)
if 'message' in data:
    sys.stderr.write(f"GitHub API error: {data['message']}\n")
    if 'errors' in data:
        sys.stderr.write(json.dumps(data['errors'], indent=2) + '\n')
    sys.exit(2)
sys.stderr.write('Unexpected API response without html_url.\n')
sys.exit(3)
PY
  <<<"$response")

  local status=$?
  if [[ $status -ne 0 ]]; then
    err "GitHub API PR creation failed."
    return 1
  fi

  printf '%s\n' "$pr_url"
}

main() {
  ensure_gh_in_path
  ensure_gh_authenticated

  local today branch pr_url
  today=$(date +%Y%m%d)
  branch="fix/cursor-pr-test-${today}"

  checkout_branch "$branch"
  create_test_file
  commit_test_file || log "Commit skipped because working tree already contains the test file."
  push_branch "$branch"

  if pr_url=$(create_pr_with_gh "$branch"); then
    log "Pull request created successfully via gh: $pr_url"
    printf '%s\n' "$pr_url"
    exit 0
  fi

  log "gh pr create failed, attempting REST API fallback."
  if pr_url=$(create_pr_with_api "$branch"); then
    log "Pull request created via REST API fallback: $pr_url"
    printf '%s\n' "$pr_url"
    exit 0
  fi

  err "Failed to create pull request with both gh and REST API."
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
