#!/usr/bin/env bash
# progress-commit.sh — snapshot uncommitted work for judge-visible history.
# Used by Cursor stop hook and optional hourly cron (see install-progress-commit-cron.sh).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Cursor hooks pipe JSON on stdin; consume and ignore.
if [[ ! -t 0 ]]; then
  cat >/dev/null 2>&1 || true
fi

MODE="${1:-manual}"
LOG_DIR="$ROOT/scripts/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/progress-commit.log"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$MODE] $*" | tee -a "$LOG_FILE"
}

has_changes() {
  ! git diff --quiet 2>/dev/null || return 0
  ! git diff --cached --quiet 2>/dev/null || return 0
  [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]
}

if ! has_changes; then
  log "no changes — skip"
  exit 0
fi

git add -A

# Never commit secrets or ephemeral agent logs.
git reset -q HEAD -- .agy-logs backend/.env scraper/.env 2>/dev/null || true
while IFS= read -r -d '' f; do
  git reset -q HEAD -- "$f" 2>/dev/null || true
done < <(git diff --cached --name-only -z 2>/dev/null | grep -z '\.env$' || true)

if git diff --cached --quiet; then
  log "nothing stageable after excludes — skip"
  exit 0
fi

BRANCH="$(git branch --show-current)"
SUMMARY="$(git diff --cached --stat | tail -1 | sed 's/^[[:space:]]*//')"
MSG="chore: progress snapshot $(date -u +%Y-%m-%dT%H:%MZ)

${SUMMARY}"

git commit -m "$MSG"
log "committed on $BRANCH"

if git remote get-url origin >/dev/null 2>&1; then
  if git push -u origin "$BRANCH" 2>>"$LOG_FILE"; then
    log "pushed to origin/$BRANCH"
  else
    log "commit ok; push failed (check auth/network)"
    exit 0
  fi
fi

exit 0
