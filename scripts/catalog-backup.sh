#!/usr/bin/env bash
# Export the production catalog to data/catalog-backup.csv and commit it if it
# changed. The deliberate manual "save a versioned backup" step now that the DB
# is the source of truth. Run after an editing session.
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsx scripts/export-db-to-csv.ts --production
git add data/catalog-backup.csv

if git diff --cached --quiet -- data/catalog-backup.csv; then
  echo "catalog-backup.csv unchanged — nothing to commit"
else
  git commit -m "chore(catalog): backup catalog-backup.csv"
  echo "Committed catalog backup."
fi
