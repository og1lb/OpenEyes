#!/usr/bin/env bash
# Pull, build and restart. Run on the server as root: bash /opt/openeyes/deploy/update.sh
set -euo pipefail
APP=/opt/openeyes
cd "$APP"

/usr/local/sbin/openeyes-backup || echo "backup failed, continuing" >&2

git fetch --quiet origin
git reset --hard --quiet "origin/$(git rev-parse --abbrev-ref HEAD)"

npm ci --no-audit --no-fund
npm run build
(cd server && npm ci --omit=dev --no-audit --no-fund)
(cd server && npm test)

chown -R root:root "$APP"
systemctl restart openeyes
sleep 2
systemctl --no-pager --lines=5 status openeyes
curl -fsS http://127.0.0.1:8000/api/health && echo
