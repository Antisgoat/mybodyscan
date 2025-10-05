# Cursor Pull Request Automation Guide

This guide explains how to ensure the Cursor editor can automatically open pull requests for the `Antisgoat/mybodyscan` repository. The automation script in `scripts/cursor_pr_automation.sh` performs the full workflow, including authentication checks, branch creation, commit creation, push, and PR creation with a REST API fallback.

## Prerequisites

- Cursor installed on macOS (Homebrew installs GitHub CLI under `/opt/homebrew/bin`).
- GitHub CLI (`gh`) installed via Homebrew: `brew install gh`.
- Git configured with access to the repository.
- Python 3 and `curl` available (pre-installed on macOS).

## Usage

1. **Expose `/opt/homebrew/bin` to Cursor**
   - Cursor usually launches a non-login shell. The script determines the appropriate init file (`~/.zshrc`, `~/.bash_profile`, or `~/.profile`) and appends `export PATH="/opt/homebrew/bin:$PATH"` if missing.
   - If `/opt/homebrew/bin` is not present (for example on Intel Macs or Linux), the script simply logs a notice and continues.

2. **Verify `gh` visibility**
   - Run the automation script from the repository root: `bash scripts/cursor_pr_automation.sh`.
   - The script first checks whether `gh` is already visible. If not, it updates the PATH and prompts the user to install `gh` if required.

3. **Authenticate `gh`**
   - The script runs `gh auth status -h github.com`. If authentication is missing, it launches `gh auth login -h github.com -s repo,workflow,read:org --web`, ensuring Cursor uses the same browser-based login as other workflows.

4. **Create a test branch and commit**
   - A branch named `fix/cursor-pr-test-<today>` is created (or re-used if it already exists).
   - The script writes `tests/cursor-pr-environment.md`, capturing the PATH and `gh` binary location to confirm environment visibility.
   - The file is committed as `test: add cursor PR environment check` and pushed to `origin`.

5. **Open the pull request**
   - First attempt: `gh pr create --base main --head fix/cursor-pr-test-<today> --title "test: verify Cursor PR creation" --body "Testing Cursor PR creation automation."`
   - Fallback: If `gh pr create` fails (for example, because of a bug or rate limit), the script reads the authenticated token (`gh auth token` or `GITHUB_TOKEN`) and calls the GitHub REST API (`POST /repos/{owner}/{repo}/pulls`).
   - On success, the script prints the PR URL and exits. On failure, errors are surfaced in the console so Cursor can report them directly.

6. **Termination behaviour**
   - The script stops after outputting the PR link. Cursor can parse the last line to confirm success.

## Manual execution steps (if you prefer not to run the script)

1. Add `/opt/homebrew/bin` to the appropriate shell init file and restart Cursor.
2. Verify `gh` is available: `which gh`.
3. Authenticate: `gh auth login -h github.com -s repo,workflow,read:org --web`.
4. Run:
   ```bash
   git checkout -b fix/cursor-pr-test-$(date +%Y%m%d)
   printf '# Cursor PR test\n' > tests/cursor-pr-environment.md
   git add tests/cursor-pr-environment.md
   git commit -m "test: add cursor PR environment check"
   git push -u origin HEAD
   gh pr create --base main --title "test: verify Cursor PR creation" --body "Testing Cursor PR creation automation."
   ```
5. If `gh pr create` fails, use the REST API fallback described earlier.

## Cleaning up

- After verifying automation, delete the test branch locally and remotely:
  ```bash
  git checkout main
  git branch -D fix/cursor-pr-test-<today>
  git push origin --delete fix/cursor-pr-test-<today>
  ```
- Remove `tests/cursor-pr-environment.md` if it is no longer needed.

## Troubleshooting

- **`gh` still not found**: Confirm that the init file is sourced by the shell Cursor launches. Cursor’s settings allow specifying an additional PATH; ensure `/opt/homebrew/bin` is listed.
- **Authentication loops**: Delete the `~/.config/gh/hosts.yml` entry for `github.com` and re-run the script.
- **REST API errors**: Ensure `gh auth token` returns a token or set `GITHUB_TOKEN` with `repo` scope manually.

By following this guide and using the provided script, Cursor gains a deterministic workflow for creating pull requests with a GitHub CLI fallback.
