#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/vlad/Agent"
LOG_DIR="$PROJECT_DIR/logs"
LOCK_FILE="$LOG_DIR/pipeline.lock"
LOG_FILE="$LOG_DIR/pipeline-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

export PATH="/usr/bin:/bin"
export HOME="/home/vlad"

cd "$PROJECT_DIR"

exec >>"$LOG_FILE" 2>&1

echo "=== Pipeline started $(date -Iseconds) ==="

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "=== Skipped: previous run still active $(date -Iseconds) ==="
  exit 0
fi

npm run pipeline:daily
EXIT_CODE=$?

echo "=== Pipeline finished $(date -Iseconds) exit=${EXIT_CODE} ==="
exit "$EXIT_CODE"
