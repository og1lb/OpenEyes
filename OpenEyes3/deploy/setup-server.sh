#!/usr/bin/env bash
# One-time setup of a fresh IONOS VPS (Ubuntu 22.04 or 24.04), run as root:
#   bash setup-server.sh openeyes.example you@example.com https://github.com/you/openeyes.git
set -euo pipefail

DOMAIN="${1:?domain, e.g. openeyes.example}"
EMAIL="${2:?email for Let's Encrypt}"
REPO="${3:?git url of this repository}"
APP=/opt/openeyes

if [ "$(id -u)" -ne 0 ]; then echo "run as root" >&2; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl gnupg git nginx certbot ufw sqlite3 unattended-upgrades fail2ban

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get -y install nodejs
fi

dpkg-reconfigure -f noninteractive unattended-upgrades

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

id openeyes >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin openeyes
install -d -o openeyes -g openeyes -m 700 /var/lib/openeyes
install -d -o root -g openeyes -m 750 /etc/openeyes
install -d -m 755 /var/www/certbot
install -d -m 700 /var/backups/openeyes

if [ ! -d "$APP/.git" ]; then git clone "$REPO" "$APP"; fi
chown -R root:root "$APP"

if [ ! -f /etc/openeyes/openeyes.env ]; then
  (cd "$APP/server" && npm ci --omit=dev && node bin/setup.js --production)
  mv "$APP/server/.env" /etc/openeyes/openeyes.env
  sed -i \
    -e "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMAIN#" \
    -e "s#^DISCORD_REDIRECT_URI=.*#DISCORD_REDIRECT_URI=https://$DOMAIN/api/auth/discord/callback#" \
    -e "s#^DATABASE_FILE=.*#DATABASE_FILE=/var/lib/openeyes/openeyes.db#" \
    -e "s#^STATIC_DIR=.*#STATIC_DIR=$APP/dist#" \
    /etc/openeyes/openeyes.env
  chown root:openeyes /etc/openeyes/openeyes.env
  chmod 640 /etc/openeyes/openeyes.env
fi

sed "s/DOMAIN/$DOMAIN/g" "$APP/deploy/nginx/openeyes.conf" > /etc/nginx/sites-available/openeyes.conf
cp "$APP/deploy/nginx/openeyes-proxy.conf" /etc/nginx/snippets/openeyes-proxy.conf
rm -f /etc/nginx/sites-enabled/default

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  cat > /etc/nginx/sites-enabled/openeyes-bootstrap.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" \
    --email "$EMAIL" --agree-tos --no-eff-email --non-interactive
  rm -f /etc/nginx/sites-enabled/openeyes-bootstrap.conf
fi

ln -sf /etc/nginx/sites-available/openeyes.conf /etc/nginx/sites-enabled/openeyes.conf
nginx -t && systemctl reload nginx

cp "$APP/deploy/openeyes.service" /etc/systemd/system/openeyes.service
cp "$APP/deploy/backup.sh" /usr/local/sbin/openeyes-backup
chmod 700 /usr/local/sbin/openeyes-backup
echo "17 3 * * * root /usr/local/sbin/openeyes-backup" > /etc/cron.d/openeyes-backup
systemctl daemon-reload
systemctl enable openeyes

echo
echo "Done. Before starting, fill in the Discord, xpub and admin values in:"
echo "  /etc/openeyes/openeyes.env"
echo "then run:  bash $APP/deploy/update.sh"
