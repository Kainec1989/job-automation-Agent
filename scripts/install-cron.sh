#!/usr/bin/env bash
set -euo pipefail

SCRIPT="/home/vlad/Agent/scripts/run-daily-pipeline.sh"
CRON_LINE="0 12 * * * ${SCRIPT}"

chmod +x "$SCRIPT"

CURRENT="$(crontab -l 2>/dev/null || true)"
FILTERED="$(echo "$CURRENT" | grep -v 'run-daily-pipeline.sh' | grep -v '^$' || true)"

{
  echo "$FILTERED"
  echo "$CRON_LINE"
} | crontab -

echo "Cron installed:"
crontab -l | grep run-daily-pipeline
