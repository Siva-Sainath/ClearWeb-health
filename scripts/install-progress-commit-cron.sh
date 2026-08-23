#!/usr/bin/env bash
# Install hourly progress commits via user crontab.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/progress-commit.sh"
MARKER="progress-commit.sh --cron"

chmod +x "$SCRIPT"
mkdir -p "$ROOT/scripts/logs"

CRON_LINE="0 * * * * cd $ROOT && $SCRIPT --cron >> $ROOT/scripts/logs/progress-commit.log 2>&1"

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(echo "$EXISTING" | grep -v "$MARKER" | grep -v 'scripts/progress-commit.sh' || true)"

{
  echo "$FILTERED"
  echo "$CRON_LINE"
} | sed '/^$/d' | crontab -

echo "Installed hourly progress commit cron:"
echo "  $CRON_LINE"
echo "Logs: $ROOT/scripts/logs/progress-commit.log"
