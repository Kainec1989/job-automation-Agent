#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/vlad/Agent"
LOG_DIR="$PROJECT_DIR/logs"
LOCK_FILE="$LOG_DIR/pipeline.lock"
LOG_FILE="$LOG_DIR/pipeline-$(date +%Y-%m-%d).log"
DB_FILE="$PROJECT_DIR/data/vacancies.db"
BACKUP_DIR="$PROJECT_DIR/data/backups"
BACKUP_KEEP=14

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

# Backup the SQLite database before mutating it; keep the newest $BACKUP_KEEP copies.
if [ -f "$DB_FILE" ]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/vacancies-$(date +%Y-%m-%dT%H-%M-%S).db"
  if cp "$DB_FILE" "$BACKUP_FILE"; then
    echo "=== DB backed up to $BACKUP_FILE ==="
  else
    echo "=== WARNING: DB backup failed ==="
  fi
  ls -1t "$BACKUP_DIR"/vacancies-*.db 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f
fi

EXIT_CODE=0
npm run pipeline:daily || EXIT_CODE=$?

echo "=== Pipeline finished $(date -Iseconds) exit=${EXIT_CODE} ==="
exit "$EXIT_CODE"
