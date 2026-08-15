#!/bin/bash
# =============================================================
# app.gdh - EC2 Server Setup Script
# Static site (plain HTML/CSS/JS, no build step), served via a `serve`
# process on 127.0.0.1:$PORT that Nginx reverse-proxies to.
# Run this ONCE on a fresh Ubuntu 24.04 EC2 instance.
#
# Usage:
#   cp deploy/.env.example deploy/.env   # then fill in real values
#   chmod +x deploy/setup-server.sh
#   sudo ./deploy/setup-server.sh [REPO_URL]
#
# REPO_URL can be passed as an argument or set in deploy/.env.
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

APP_NAME="${APP_NAME:-app}"
APP_DIR="${APP_DIR:-/var/www/app}"
DOMAIN="${DOMAIN:-app.globaldesingerhub.com}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
PORT="${PORT:-8003}"
REPO_URL="${1:-$REPO_URL}"

echo "Starting $APP_NAME server setup..."

# --- 1. System updates ---
echo "Updating system packages..."
apt update && apt upgrade -y

# --- 2. Install dependencies ---
# No Python/venv/Postgres/Gunicorn: this is a static site with no build step.
# It's served by a tiny Node static-file server (`serve`) on 127.0.0.1:$PORT,
# which Nginx reverse-proxies to - keeps the app on a dedicated port like the
# other apps on this box instead of pointing Nginx `root` at the checkout.
echo "Installing Nginx, Git, Certbot..."
apt install -y \
    nginx \
    git \
    certbot \
    python3-certbot-nginx \
    curl \
    ufw

echo "Ensuring Node.js is available..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi

echo "Installing serve (static file server)..."
npm install -g serve
SERVE_BIN="$(command -v serve)"

# --- 3. Configure firewall ---
echo "Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# --- 4. Clone or update repository ---
# Mark the repo safe regardless of which user (root, ubuntu, ...) owns the
# checkout vs. runs this script - git refuses to operate otherwise.
git config --global --add safe.directory "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
    echo "Existing checkout found at $APP_DIR, pulling latest..."
    # Reassert ownership in case a previous run (e.g. a manual `git pull` as
    # root) left files owned by root, which would make the pull below fail
    # with "Permission denied" writing .git/FETCH_HEAD as $DEPLOY_USER.
    chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
    sudo -u "$DEPLOY_USER" git config --global --add safe.directory "$APP_DIR"
    sudo -u "$DEPLOY_USER" git -C "$APP_DIR" pull origin master
elif [ -n "$REPO_URL" ]; then
    echo "Cloning repository..."
    mkdir -p "$(dirname "$APP_DIR")"
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
else
    echo "No repo URL provided and no existing checkout at $APP_DIR."
    echo "Usage: sudo ./setup-server.sh git@github.com:aiOakuser/app.git"
    echo "   (or set REPO_URL in deploy/.env)"
    exit 1
fi

# --- 5. Systemd service: static file server on 127.0.0.1:$PORT ---
echo "Configuring $APP_NAME systemd service on port $PORT..."
cat > "/etc/systemd/system/$APP_NAME.service" << EOF
[Unit]
Description=Static file server for $APP_NAME (serve on port $PORT)
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR
ExecStart=$SERVE_BIN -l tcp://127.0.0.1:$PORT --no-clipboard $APP_DIR
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"

# --- 6. Configure Nginx (reverse proxy to the static file server) ---
echo "Configuring Nginx..."
cat > "/etc/nginx/sites-available/$APP_NAME" << EOF
server {
    listen 80;
    server_name $DOMAIN;

    gzip on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Unfingerprinted assets (no build step) - short cache, not immutable,
    # so updated images/CSS don't stay stale in returning visitors' caches.
    location /assets/ {
        proxy_pass http://127.0.0.1:$PORT;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        access_log off;
    }

    location = /robots.txt { proxy_pass http://127.0.0.1:$PORT; access_log off; }
    location = /sitemap.xml { proxy_pass http://127.0.0.1:$PORT; access_log off; }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# --- Done ---
echo ""
echo "============================================="
echo "Server setup complete!"
echo "============================================="
echo ""
echo "Next steps:"
echo "  1. Point DNS for $DOMAIN at this server's public IP:"
IMDS_TOKEN="$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)"
PUBLIC_IP="$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<your-ec2-ip>')"
echo "     $PUBLIC_IP"
if [ -n "$CERTBOT_EMAIL" ]; then
    echo "  2. Get SSL cert:    sudo certbot --nginx -d $DOMAIN --email $CERTBOT_EMAIL --agree-tos -n"
else
    echo "  2. Get SSL cert:    sudo certbot --nginx -d $DOMAIN"
fi
echo "  3. Set up GitHub Secrets (used by .github/workflows/deploy.yml):"
echo "     - EC2_HOST = <the IP above>"
echo "     - EC2_USER = $DEPLOY_USER"
echo "     - EC2_SSH_KEY = <contents of your .pem file>"
echo ""
echo "Your site will be live at: http://$DOMAIN"
echo "============================================="
