# Production Fincra Static IP Gateway (`fincra-gateway`)

Dedicated, high-performance Node.js/Nginx reverse-proxy gateway providing a fixed static egress IP (**`137.184.216.44`**) for all outbound NoteStandard → Fincra API traffic.

---

## Technical Specifications

- **Server IP**: `137.184.216.44` (DigitalOcean Droplet `notestandard-gateway`)
- **Domain**: `gateway.notestandard.com`
- **Gateway Port**: `4000` (internal Express application)
- **Protocol**: HTTPS (Reverse proxied via Nginx)
- **Authentication**: `X-Gateway-Key` shared secret header + optional `HMAC-SHA256` request signatures (`X-Timestamp`, `X-Signature`)
- **Circuit Breaker**: Active in-memory circuit breaker (`failureThreshold: 5`, `cooldown: 30s`)
- **Connection Pooling**: Keep-Alive HTTPS Agent (`maxSockets: 50`)

---

## Gateway Endpoints

| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET /health` | `GET` | Public | Returns status (`ok` or `degraded`), upstream Fincra reachability, uptime, memory stats, and circuit state. |
| `GET /metrics` | `GET` | Required | Returns JSON counters for total requests, success, failures, rate-limiting, average latency, and circuit status. |
| `POST /proxy` | `POST` | Required | Forwards approved requests to Fincra API (`https://api.fincra.com` or `https://sandboxapi.fincra.com`). |

---

## DigitalOcean Droplet Installation & Setup Guide

### 1. Provision Directory & Codebase
On your DigitalOcean Droplet (`137.184.216.44`):
```bash
sudo mkdir -p /opt/fincra-gateway
sudo mkdir -p /var/log/fincra-gateway
sudo chown -R $USER:$USER /opt/fincra-gateway
sudo chown -R $USER:$USER /var/log/fincra-gateway
```

Copy the project files from `fincra-gateway/` to `/opt/fincra-gateway/`.

### 2. Time Synchronization (NTP)
Prevent clock drift issues with HMAC verification:
```bash
sudo timedatectl set-ntp true
timedatectl status
```

### 3. Environment Setup
Create `/opt/fincra-gateway/.env`:
```bash
PORT=4000
NODE_ENV=production
GATEWAY_KEY_CURRENT=your_generated_secure_shared_secret_key
FINCRA_ENV=production
LOG_DIR=/var/log/fincra-gateway
```

### 4. Install Dependencies & Start PM2
```bash
cd /opt/fincra-gateway
npm install --production

# Start PM2 Service
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Log Rotation Setup (`logrotate`)
Create `/etc/logrotate.d/fincra-gateway`:
```conf
/var/log/fincra-gateway/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 6. Nginx & SSL Certificate Setup (Certbot)
```bash
# Copy Nginx configuration
sudo cp /opt/fincra-gateway/nginx.conf /etc/nginx/sites-available/fincra-gateway
sudo ln -sf /etc/nginx/sites-available/fincra-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain Free SSL Certificate via Certbot
sudo certbot --nginx -d gateway.notestandard.com
```

---

## Secret Rotation Protocol

To rotate gateway keys with zero downtime:

1. Generate a new secret key (`NEW_KEY`).
2. On DigitalOcean `/opt/fincra-gateway/.env`, set:
   ```env
   GATEWAY_KEY_CURRENT=NEW_KEY
   GATEWAY_KEY_PREVIOUS=OLD_KEY
   ```
3. Run `pm2 reload fincra-gateway`.
4. Update `FINCRA_GATEWAY_KEY=NEW_KEY` on Render backend environment settings.
5. Deploy Render backend.
6. Once deployed, remove `GATEWAY_KEY_PREVIOUS` from DigitalOcean `.env` and run `pm2 reload fincra-gateway`.

---

## Deployment Rollout Sequence

1. **Deploy Gateway**: Install `/opt/fincra-gateway` on DigitalOcean (`137.184.216.44`) and start PM2.
2. **Setup SSL & Nginx**: Configure Nginx for `gateway.notestandard.com` and verify HTTPS.
3. **Test Gateway Health**: Verify `https://gateway.notestandard.com/health` returns `200 OK`.
4. **Fincra Allowlisting**: Provide IP `137.184.216.44` to Fincra support for IP allowlisting.
5. **Configure Render Environment**: Set `FINCRA_GATEWAY_URL=https://gateway.notestandard.com/proxy` and `FINCRA_GATEWAY_KEY` in Render dashboard.
6. **Deploy Render Backend**: Trigger deployment on Render.
7. **Perform Production Verification**: Execute a small verification payment to confirm traffic exits via `137.184.216.44`.

---

## Rollback Procedures

If the gateway needs to be taken offline or reverted:

### Emergency Gateway Service Rollback
```bash
cd /opt/fincra-gateway
pm2 stop fincra-gateway
git checkout HEAD~1
npm install
pm2 restart fincra-gateway
```

### Render Backend Direct Fallback (Local/Staging only)
To temporarily disable gateway routing on Render:
1. Remove `FINCRA_GATEWAY_URL` from Render environment variables.
2. Render will automatically fall back to calling `https://api.fincra.com` directly.

---

## Production Deployment Checklist

- [ ] DigitalOcean Droplet running Node.js 22, Nginx, and PM2.
- [ ] Time synchronization (NTP) verified active on Droplet.
- [ ] Domain `gateway.notestandard.com` points to `137.184.216.44`.
- [ ] Valid SSL certificate installed via Certbot.
- [ ] Nginx proxies `https://gateway.notestandard.com` to `http://127.0.0.1:4000`.
- [ ] PM2 service autostarts on Droplet reboot (`pm2 save` & `pm2 startup`).
- [ ] Log rotation configured under `/etc/logrotate.d/fincra-gateway`.
- [ ] `GET /health` returns status `200 OK`.
- [ ] `GET /metrics` requires `X-Gateway-Key` and returns JSON counters.
- [ ] Unauthorized or invalid `X-Gateway-Key` requests return `401 Unauthorized`.
- [ ] Requests to non-whitelisted paths return `400 Bad Request`.
- [ ] Oversized payloads (>1MB) return `413 Payload Too Large`.
- [ ] Render environment variables `FINCRA_GATEWAY_URL` and `FINCRA_GATEWAY_KEY` set.
- [ ] Fincra confirms allowlisting for static IP `137.184.216.44`.
