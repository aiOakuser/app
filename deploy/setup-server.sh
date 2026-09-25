#!/bin/bash
# =============================================================
# Production deploy for the app (Next.js) on Ubuntu.
#
# One idempotent script for BOTH first-time setup and every later deploy.
# Each step checks the current state and skips what is already done, so it
# is safe to re-run. It never overwrites the runtime secrets file, and it
# never overwrites an existing Nginx site unless FORCE_NGINX=1.
#
# What it sets up:
#   - Node.js 22 (NodeSource) if the box has no Node >= 20
#   - swap (npm ci / next build are OOM-killed on a ~1 GB instance without it)
#   - the app checked out on $BRANCH, owned by www-data, built with next build
#   - a systemd unit running `next start` on 127.0.0.1:$PORT as www-data
#   - Nginx terminating TLS with a Cloudflare Origin certificate, proxying to
#     the app. Cloudflare sits in front with SSL/TLS mode "Full (strict)".
#
# Usage (on the server):
#   sudo ./deploy/setup-server.sh              # deploy $BRANCH (default master)
#   sudo ./deploy/setup-server.sh REPO_URL     # first run, no checkout yet
#
# Optional settings live in deploy/.env (see deploy/.env.example).
# Runtime secrets live in /etc/app.env, not in the repo.
# =============================================================

set -eu

log()  { printf '\n==> %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
PENDING=()
warn() { printf 'WARNING: %s\n' "$*" >&2; PENDING+=("$*"); }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo $0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$SCRIPT_DIR/.env"
    set +a
fi

APP_NAME="${APP_NAME:-app}"
APP_DIR="${APP_DIR:-/var/www/app}"
APP_USER="${APP_USER:-www-data}"
BRANCH="${BRANCH:-master}"
DOMAIN="${DOMAIN:-app.aioak.io}"
PORT="${PORT:-8003}"
REPO_URL="${1:-${REPO_URL:-https://github.com/aiOakuser/app.git}}"
ENV_FILE="${ENV_FILE:-/etc/$APP_NAME.env}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
CERT="${CERT:-/etc/nginx/ssl/aioak-origin.crt}"
KEY="${KEY:-/etc/nginx/ssl/aioak-origin.key}"
FORCE_NGINX="${FORCE_NGINX:-0}"

echo "Deploying $APP_NAME: branch $BRANCH -> $APP_DIR, https://$DOMAIN, port $PORT"

# --- 1. System packages ---
# No `apt upgrade`: a deploy should not upgrade the whole OS. Certbot is not
# used; TLS is a Cloudflare Origin certificate (step 9).
log "1/9 System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git curl ufw openssl ca-certificates

# --- 2. Node.js ---
# Next.js needs Node >= 20. Check the major version, not just presence: an
# older distro Node would otherwise be accepted and `npm ci` would then fail
# its engine checks. Set NODE_DIR (e.g. /opt/nodejs22/bin) to use a specific
# install instead.
log "2/9 Node.js"
if [ -z "${NODE_DIR:-}" ]; then
    CURRENT_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
    if [ -z "$CURRENT_MAJOR" ] || [ "$CURRENT_MAJOR" -lt 20 ]; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
    fi
    NODE_DIR="$(dirname "$(command -v npm)")"
fi
NPM_BIN="$NODE_DIR/npm"
[ -x "$NPM_BIN" ] || die "npm not found at $NPM_BIN"
NODE_MAJOR="$("$NODE_DIR/node" -v | sed -E 's/^v([0-9]+).*/\1/')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR in $NODE_DIR is too old; Next.js needs >= 20"
echo "Using Node $("$NODE_DIR/node" -v) from $NODE_DIR"

# --- 3. Swap ---
# Without swap, `npm ci` and `next build` get OOM-killed on a small instance
# ("Killed"), leaving node_modules incomplete and `next: not found` behind.
log "3/9 Swap"
if [ -n "$(swapon --show --noheadings)" ]; then
    echo "Swap already active:"
    swapon --show
elif [ "$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)" -ge 3000000 ]; then
    echo "3 GB+ RAM, swap not needed"
else
    if [ ! -f /swapfile ]; then
        fallocate -l "$SWAP_SIZE" /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
    fi
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- 4. Firewall ---
log "4/9 Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# --- 5. Source: checkout $BRANCH, owned by $APP_USER ---
# All git and npm commands run as $APP_USER, never root: root-run installs
# leave root-owned files that later runs cannot clean up (EACCES).
log "5/9 Source ($BRANCH)"
id "$APP_USER" >/dev/null 2>&1 || die "User $APP_USER does not exist"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME/.npm"    # npm cache

as_app() { sudo -H -u "$APP_USER" env PATH="$NODE_DIR:$PATH" "$@"; }

if [ -d "$APP_DIR/.git" ]; then
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    cd "$APP_DIR"
    as_app git fetch origin
    # Deploy $BRANCH explicitly. A checkout left on another branch (for example
    # main) would make `git pull --ff-only origin master` fail or do nothing.
    as_app git checkout "$BRANCH"
    as_app git pull --ff-only origin "$BRANCH"
else
    [ -n "$REPO_URL" ] || die "No checkout at $APP_DIR and no REPO_URL given"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    cd "$APP_DIR"
fi
echo "Deploying commit: $(as_app git log --oneline -1)"

# Fail fast with a clear message instead of npm's EINTEGRITY: an old bulk
# find-and-replace once corrupted lockfile hashes with this placeholder.
if grep -q '{brand_name}' package-lock.json; then
    die "package-lock.json contains the {brand_name} placeholder; deploy a newer commit"
fi

# --- 6. Runtime environment ---
# Secrets live outside the repo in a root-only file that systemd loads. It is
# created once and never overwritten, so re-deploys keep the same AUTH_SECRET
# (a new one would sign every user out). Edit it by hand, then restart.
log "6/9 Runtime environment ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
    (
        umask 077
        echo "AUTH_SECRET=${AUTH_SECRET:-$(openssl rand -base64 48)}" > "$ENV_FILE"
        for v in TENANT_SLUG TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_NUMBER; do
            if [ -n "${!v:-}" ]; then echo "$v=${!v}" >> "$ENV_FILE"; fi
        done
    )
    echo "Created $ENV_FILE"
elif ! grep -q '^AUTH_SECRET=.' "$ENV_FILE"; then
    echo "AUTH_SECRET=$(openssl rand -base64 48)" >> "$ENV_FILE"
    echo "Added a generated AUTH_SECRET to $ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 600 "$ENV_FILE"
grep -q '^TWILIO_ACCOUNT_SID=.' "$ENV_FILE" || warn "Twilio is not configured in $ENV_FILE: OTP codes are only logged, no SMS is sent. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER, then: sudo systemctl restart $APP_NAME"
grep -q '^TENANT_SLUG=.' "$ENV_FILE" || warn "TENANT_SLUG is not set in $ENV_FILE; check the root sign-in page (src/app/page.tsx) shows the tenant you expect"

# --- 7. Install dependencies and build ---
# `npm ci` deletes and reinstalls node_modules, so a half-installed tree from
# an earlier failed run is replaced. --include=dev keeps TypeScript and
# Tailwind available to the build even when NODE_ENV=production is set.
log "7/9 Install dependencies and build"
as_app npm ci --include=dev
as_app npm run build

# --- 8. systemd service ---
# Restart only after the build finishes: the running process serves the old
# .next until restarted, and starting before any build exists exits with 1.
log "8/9 systemd service"
cat > "/etc/systemd/system/$APP_NAME.service" << EOF
[Unit]
Description=$APP_NAME Next.js application (next start on 127.0.0.1:$PORT)
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOSTNAME=127.0.0.1
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
ExecStart=$NPM_BIN start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"

echo "Waiting for the app on 127.0.0.1:$PORT ..."
HTTP_CODE=000
for _ in $(seq 1 30); do
    HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
    if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" -lt 500 ]; then break; fi
    sleep 1
done
if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" -ge 500 ]; then
    systemctl status "$APP_NAME" --no-pager || true
    journalctl -u "$APP_NAME" -n 30 --no-pager || true
    die "$APP_NAME is not answering on 127.0.0.1:$PORT (last HTTP status $HTTP_CODE)"
fi
echo "App is up: HTTP $HTTP_CODE"

# --- 9. Nginx + Cloudflare Origin certificate ---
# Cloudflare (Full strict) rejects the origin with error 526 unless Nginx
# presents a valid certificate that covers $DOMAIN. Create one in the
# Cloudflare dashboard (SSL/TLS -> Origin Server -> Create Certificate) and
# save it at $CERT and $KEY. The private key is shown only once.
log "9/9 Nginx and TLS"
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    warn "Origin certificate missing ($CERT / $KEY): Nginx was not configured and Cloudflare will return 525/526. Create a Cloudflare Origin certificate for $DOMAIN, save it with: sudo mkdir -p $(dirname "$CERT"); sudo nano $CERT; sudo nano $KEY   then re-run this script."
else
    chown root:root "$CERT" "$KEY"
    chmod 644 "$CERT"
    chmod 600 "$KEY"

    SITE="/etc/nginx/sites-available/$APP_NAME"
    if [ ! -f "$SITE" ] || [ "$FORCE_NGINX" = "1" ]; then
        cat > "$SITE" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     $CERT;
    ssl_certificate_key $KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 20M;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 120s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
        echo "Wrote $SITE"
    else
        echo "Keeping existing $SITE (set FORCE_NGINX=1 to regenerate it)"
    fi
    ln -sf "$SITE" "/etc/nginx/sites-enabled/$APP_NAME"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl reload nginx || systemctl restart nginx

    # Check what Cloudflare will actually see. Any failure here is a 526.
    openssl x509 -in "$CERT" -noout >/dev/null 2>&1 \
        || die "$CERT is not a valid PEM certificate (paste only the -----BEGIN/END CERTIFICATE----- block)"
    TLS_WARNINGS_BEFORE="${#PENDING[@]}"
    if ! openssl x509 -in "$CERT" -noout -checkend 0 >/dev/null; then
        warn "Origin certificate $CERT has expired: Cloudflare returns 526. Create a new Origin certificate."
    fi
    case "$(openssl x509 -in "$CERT" -noout -checkhost "$DOMAIN")" in
        *"does match"*) ;;
        *)
            CERT_HOSTS="$(openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -o 'DNS:[^ ,]*' | tr '\n' ' ')"
            warn "Origin certificate $CERT does not cover $DOMAIN. Hostnames on it: ${CERT_HOSTS:-none listed}. Cloudflare returns 526 for $DOMAIN. Create an Origin certificate that includes $DOMAIN, or set DOMAIN, CERT and KEY in deploy/.env to the domain and certificate you actually serve."
            ;;
    esac
    SERVED="$(timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256 2>/dev/null || true)"
    WANTED="$(openssl x509 -in "$CERT" -noout -fingerprint -sha256)"
    if [ "$SERVED" != "$WANTED" ]; then
        warn "Nginx does not serve $CERT for $DOMAIN (it serves: ${SERVED:-nothing}). Check ssl_certificate and server_name in /etc/nginx/sites-enabled/$APP_NAME, or re-run with FORCE_NGINX=1 to regenerate the site."
    fi
    # Only claim success when every check above passed.
    if [ "${#PENDING[@]}" -eq "$TLS_WARNINGS_BEFORE" ]; then
        echo "TLS OK: $CERT covers $DOMAIN, is unexpired, and is the certificate Nginx serves"
    fi
fi

# --- Done ---
echo
echo "============================================="
echo "Deploy finished: $(as_app git log --oneline -1)"
echo "  service: $(systemctl is-active "$APP_NAME")   nginx: $(systemctl is-active nginx)"
echo "============================================="
if [ "${#PENDING[@]}" -gt 0 ]; then
    echo "ACTION REQUIRED:"
    for item in "${PENDING[@]}"; do echo "  - $item"; done
    echo
fi
IMDS_TOKEN="$(curl -sf --max-time 3 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)"
PUBLIC_IP="$(curl -sf --max-time 3 -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<your-ec2-ip>')"
echo "Cloudflare (dashboard, one time):"
echo "  - DNS: A record for ${DOMAIN%%.*} -> $PUBLIC_IP, proxy status Proxied"
echo "  - SSL/TLS -> Overview: mode Full (strict)"
echo "Check:  curl -sI https://$DOMAIN | head -1"
