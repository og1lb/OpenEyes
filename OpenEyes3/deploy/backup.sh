#!/usr/bin/env bash
# Consistent online copy of the SQLite database, kept for 14 days.
set -euo pipefail
DB=/var/lib/openeyes/openeyes.db
DIR=/var/backups/openeyes
[ -f "$DB" ] || exit 0
STAMP="$(date -u +%Y%m%d-%H%M%S)"
sqlite3 "$DB" ".backup '$DIR/openeyes-$STAMP.db'"
gzip -9 "$DIR/openeyes-$STAMP.db"
chmod 600 "$DIR/openeyes-$STAMP.db.gz"
find "$DIR" -name 'openeyes-*.db.gz' -mtime +14 -delete
