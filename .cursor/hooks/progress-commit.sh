#!/usr/bin/env bash
# Cursor stop hook — commit + push when the agent finishes with local changes.
exec "$(git rev-parse --show-toplevel 2>/dev/null || echo .)/scripts/progress-commit.sh" --hook
