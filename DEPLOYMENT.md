# Deployment

This site runs as a long-lived Next.js server (`next start`), managed by
systemd and reverse-proxied by Nginx — not a static export.

| Item            | Value                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| URL             | `https://app.aioak.io` (behind Cloudflare)                                |
| Host            | AWS EC2, Ubuntu                                                           |
| App directory   | `/var/www/app` (repo checkout, built in place)                            |
| Branch deployed | `master`                                                                  |
| Service         | `app.service`, runs as `www-data`, listens on `127.0.0.1:8003`            |
| Nginx site      | `/etc/nginx/sites-available/app`                                          |
| Node            | 22, installed at `/opt/nodejs22` (the system Node is too old for Next 16) |

Request path: browser → Cloudflare (proxied, SSL mode _Full (strict)_) →
Nginx on `:443` (Cloudflare Origin CA cert) → Next.js on `127.0.0.1:8003`.

## Deploy a change (git push → live)

### 1. Push from your machine

```bash
git push origin master
```

### 2. Build and restart on the server

SSH in, then:

```bash
cd /var/www/app
sudo -u www-data git pull --ff-only origin master
sudo -u www-data env PATH="/opt/nodejs22/bin:$PATH" npm ci --include=dev
sudo -u www-data env PATH="/opt/nodejs22/bin:$PATH" npm run build
sudo systemctl restart app
```

- **Restart after the build finishes.** The running Node process only picks
  up a new `.next` build when it restarts; an Nginx reload does nothing here.
  Starting the service before a build exists makes it exit with status 1.
- **`PATH`, not just the binary path, matters.** `npm` starts with
  `#!/usr/bin/env node`, so calling `/opt/nodejs22/bin/npm` by full path still
  resolves `node` from `$PATH`. Prepend `/opt/nodejs22/bin` as shown, or the
  system Node 18 is used and the install/build breaks.
- **Run as `www-data`, never root.** A root-run install leaves root-owned files
  in `node_modules` that a later `www-data` run can't clean up (`EACCES`). To
  recover: `sudo chown -R www-data:www-data /var/www/app`.
- **`--include=dev`** keeps TypeScript and Tailwind available to the build even
  if `NODE_ENV=production` is set in the shell.

### 3. Verify

```bash
sudo systemctl is-active app            # active
curl -sI http://127.0.0.1:8003 | head -1             # HTTP/1.1 200 OK  (the app)
curl -I https://app.aioak.io         # 200 (through Cloudflare + Nginx)
```

Then load the site and spot-check the service grid, the Services/Staff tabs,
and the Location & Hours footer. If something is off, start with
`sudo journalctl -u app -n 50 --no-pager`.

## One-time server setup

Only needed on a new box. Write config files with `tee` and a heredoc as shown
rather than pasting into an editor — pasted markdown headings and code fences
end up inside the file and break it.

### 1. Packages

```bash
sudo apt update && sudo apt install -y nginx git
```

Open ports 80 and 443 in the EC2 security group (and `sudo ufw allow 'Nginx Full'`
if `ufw` is enabled).

### 2. Node 22 at `/opt/nodejs22`

```bash
cd /tmp
case "$(uname -m)" in x86_64) A=x64;; aarch64) A=arm64;; esac
F=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v[0-9.]*-linux-$A\.tar\.xz" | head -1)
curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$F"
curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep " $F\$" | sha256sum -c -
sudo mkdir -p /opt/nodejs22
sudo tar -xJf "$F" -C /opt/nodejs22 --strip-components=1
/opt/nodejs22/bin/node -v          # v22.x
```

### 3. Clone and set ownership

Clone into the app directory, not into `/var/www` itself (no `git init` there).

```bash
cd /var/www
sudo git clone -b master https://github.com/aiOakuser/app.git app
sudo chown -R www-data:www-data /var/www/app
sudo mkdir -p /var/www/.npm && sudo chown -R www-data:www-data /var/www/.npm
```

`www-data` needs a writable npm cache; `/var/www/.npm` is scoped to that one
directory rather than all of `/var/www`.

### 4. First build

```bash
cd /var/www/app
sudo -u www-data env PATH="/opt/nodejs22/bin:$PATH" npm ci --include=dev
sudo -u www-data env PATH="/opt/nodejs22/bin:$PATH" npm run build
```

On a small instance `npm ci` or the build can be killed for lack of memory
(`Killed`). A killed `npm ci` leaves `node_modules` incomplete, so later steps
fail with `next: not found`. Add swap, then rerun `npm ci` and the build. Stop
the service first if it is crash-looping, so it doesn't compete for memory:

```bash
sudo systemctl stop app
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # survive reboots
free -h                                                       # Swap: 2.0Gi
```

### 5. systemd service

```bash
sudo tee /etc/systemd/system/app.service >/dev/null <<'EOF'
[Unit]
Description=mazu Hair Studio Next.js Application
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/app
Environment=NODE_ENV=production
Environment=PORT=8003
Environment=HOSTNAME=127.0.0.1
Environment=PATH=/opt/nodejs22/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/nodejs22/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now app
```

`npm start` runs `next start`, which serves the `.next` build. The app only
listens on `127.0.0.1:8003`; it is reachable only through Nginx. Run
`sudo systemctl daemon-reload` after any edit to the unit file.

### 6. Origin certificate and Nginx

Create a Cloudflare Origin certificate (Cloudflare dashboard → **SSL/TLS →
Origin Server → Create Certificate**, hostnames `app.aioak.io` and
`*.app.aioak.io`) and install it. The private key is shown only once; never
commit it.

```bash
sudo mkdir -p /etc/nginx/ssl
sudo nano /etc/nginx/ssl/aioak-origin.crt     # paste certificate
sudo nano /etc/nginx/ssl/aioak-origin.key     # paste private key
sudo chown root:root /etc/nginx/ssl/aioak-origin.*
sudo chmod 644 /etc/nginx/ssl/aioak-origin.crt
sudo chmod 600 /etc/nginx/ssl/aioak-origin.key
```

Then the site config:

```bash
sudo tee /etc/nginx/sites-available/app >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name app.aioak.io;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.aioak.io;

    ssl_certificate     /etc/nginx/ssl/aioak-origin.crt;
    ssl_certificate_key /etc/nginx/ssl/aioak-origin.key;
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
        proxy_pass http://127.0.0.1:8003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 120s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
sudo nginx -t && sudo systemctl reload nginx
sudo ss -ltnp | grep -E ':(80|443)\s'        # both 80 and 443 listening
```

Newer Nginx (1.25.1+) prints a harmless deprecation warning for
`listen … http2`; it can be replaced with a separate `http2 on;` line.

Only `app.aioak.io` is served. `*.app.aioak.io` covers a single
label, so a `www.` name under it would not match the certificate.

### 7. Cloudflare DNS and SSL mode

- **DNS → Records:** add an `A` record, name `app`, pointing to the
  server's public IP (`curl -s https://checkip.amazonaws.com` on the box), proxy
  status **Proxied**.
- **SSL/TLS → Overview:** set the mode to **Full (strict)**. _Flexible_ makes
  Cloudflare talk plain HTTP to port 80, which loops against the HTTPS redirect.

## Troubleshooting

| Symptom                                            | Likely cause and fix                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `DNS_PROBE_FINISHED_NXDOMAIN`                      | No DNS record. Add the Cloudflare `A` record (step 7); flush the local cache with `ipconfig /flushdns` on Windows. |
| Cloudflare 502, or Nginx "502 Bad Gateway"         | The app isn't running on `:8003`. Check `journalctl -u app`; usually a missing or failed build.                    |
| Cloudflare 521 / 522                               | Nothing accepting connections on 443. Check `ss -ltnp` and that the Nginx site is symlinked into `sites-enabled`.  |
| Cloudflare 525 / 526                               | Origin certificate missing or invalid, or SSL mode doesn't match. Confirm the `/etc/nginx/ssl/` files exist.       |
| Service `status=203/EXEC`                          | systemd can't run `/opt/nodejs22/bin/npm`; Node 22 isn't installed there (setup step 2).                           |
| Service `status=1/FAILURE`, restart counter climbs | Usually no `.next` build ("Could not find a production build"). Run the build, then restart.                       |
| `Unit file … changed on disk`                      | Run `sudo systemctl daemon-reload`.                                                                                |
| `nginx -t`: cannot load certificate                | The cert or key file is missing from `/etc/nginx/ssl/`.                                                            |
| `Killed`, then `next: not found`                   | Out-of-memory kill left `node_modules` incomplete (service exits 127). Add swap (setup step 4), rerun `npm ci`.    |
| `EACCES` during `npm ci`                           | Root-owned files from an earlier run; `sudo chown -R www-data:www-data /var/www/app /var/www/.npm`.                |

`systemctl status` opens a pager; press `q` to leave it, or add `--no-pager`.

## Notes

- `nixpacks.toml` in the repo is for container-style platforms such as Coolify.
  It is not used by this systemd setup.
- Deploys are manual: pushing to `master` does not update the server until the
  server-side steps above are run.
