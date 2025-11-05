# CryptoBot Nginx Integration Guide

**Integration with existing cestou.store nginx configuration**

---

## ✅ What I've Done

I've integrated CryptoBot into your existing nginx setup at **cestou.store**:

### 1. Created Updated Nginx Config
- **File:** `~/nginx-updated.conf` on your VPS
- **Added:** CryptoBot upstream (port 3001)
- **Added:** `/cryptobot` location route
- **Preserved:** All your existing cestou.store configuration
- **Preserved:** SSL certificates and settings

### 2. Created Installation Script
- **File:** `~/install-cryptobot-nginx.sh` on your VPS
- **Features:**
  - Automatic backup of current config
  - Installs new config
  - Tests nginx configuration
  - Rolls back if there's an error
  - Reloads nginx on success

---

## 🚀 Installation (One Command!)

SSH into your VPS and run:

```bash
ssh deploy@72.60.56.80
sudo bash ~/install-cryptobot-nginx.sh
```

**That's it!** The script will:
1. ✅ Backup your current nginx config
2. ✅ Install the updated config
3. ✅ Test the configuration
4. ✅ Reload nginx
5. ✅ Show you the access URLs

---

## 🌐 Access URLs (After Installation)

### Secure (HTTPS - Recommended):
```
https://cestou.store/cryptobot
```

### Standard (HTTP):
```
http://cestou.store/cryptobot
```

### API Endpoints:
```
https://cestou.store/cryptobot/api/status
https://cestou.store/cryptobot/api/stats
https://cestou.store/cryptobot/api/bots
```

---

## 📋 What Changed in Nginx Config

### Added CryptoBot Upstream:
```nginx
upstream cryptobot_api {
    server 127.0.0.1:3001;
    keepalive 64;
}
```

### Added CryptoBot Location:
```nginx
location /cryptobot {
    proxy_pass http://cryptobot_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
}
```

### Everything Else Stays the Same:
- ✅ Your cestou.store frontend (/)
- ✅ Your cestou.store API (/api)
- ✅ SSL certificates
- ✅ All other settings

---

## 🔍 How It Works

### URL Routing:
```
https://cestou.store/              → Angular Frontend (your app)
https://cestou.store/api           → Cestou API (port 3000)
https://cestou.store/cryptobot     → CryptoBot Dashboard (port 3001)
```

### Architecture:
```
Internet
    ↓
Nginx (Port 80/443)
    ↓
    ├─ / → Angular App (/var/www/cestou)
    ├─ /api → Cestou API (port 3000)
    └─ /cryptobot → CryptoBot (port 3001)
```

---

## ✅ Verification Steps

### 1. Check Installation Success
After running the script, you should see:
```
✅ CryptoBot Successfully Integrated!

Access your CryptoBot dashboard at:
  https://cestou.store/cryptobot
```

### 2. Test in Browser
Open: `https://cestou.store/cryptobot`

You should see: **🤖 Crypto Trading Bot Dashboard**

### 3. Test API Endpoints
```bash
curl https://cestou.store/cryptobot/api/status
```

Should return:
```json
{"success":true,"initialized":false,"running":false}
```

### 4. Verify Existing App Still Works
Open: `https://cestou.store/`

Your Angular app should still work perfectly ✅

---

## 🛠️ Manual Installation (If Needed)

If you prefer to do it manually:

```bash
# SSH into VPS
ssh deploy@72.60.56.80

# Backup current config
sudo cp /etc/nginx/sites-available/cestou.store /etc/nginx/sites-available/cestou.store.backup

# Install new config
sudo cp ~/nginx-updated.conf /etc/nginx/sites-available/cestou.store

# Test nginx config
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

---

## 🔄 Rollback (If Needed)

If something goes wrong, the script automatically rolls back. But you can also manually rollback:

```bash
# List backups
ls -la /etc/nginx/sites-available/cestou.store.backup-*

# Restore a backup (replace with actual filename)
sudo cp /etc/nginx/sites-available/cestou.store.backup-20251104-XXXXXX /etc/nginx/sites-available/cestou.store

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

---

## 📊 Current Status

### Files Created on VPS:
```
~/nginx-updated.conf              - Updated nginx configuration
~/install-cryptobot-nginx.sh      - Installation script
```

### What Needs to Be Done:
```
1. Run: sudo bash ~/install-cryptobot-nginx.sh
2. Open: https://cestou.store/cryptobot
3. Done! ✅
```

---

## 🎯 After Installation

### 1. Access Dashboard
```
https://cestou.store/cryptobot
```

### 2. Initialize Bot
- Click "Initialize System"
- Choose **FAKE** mode (simulation)
- Set initial budget: $500

### 3. Start Trading
- Click "Start All Bots"
- View real-time stats
- Monitor trades

### 4. Auto-Deployment Works
Every time you push to GitHub main branch:
- ✅ Code pulls to VPS
- ✅ Dependencies install
- ✅ Project builds
- ✅ PM2 restarts bot
- ✅ Dashboard updates

---

## 🔐 Security Features

### SSL/TLS:
- ✅ Automatic redirect to HTTPS
- ✅ Let's Encrypt certificates
- ✅ Secure connection

### Proxy Headers:
- ✅ Real IP forwarding
- ✅ Protocol forwarding
- ✅ WebSocket support

### Isolation:
- ✅ Bot runs as non-root user (deploy)
- ✅ Separate from main app
- ✅ Independent restart/update

---

## 🚨 Troubleshooting

### Script fails with "permission denied"?
```bash
# Make sure script is executable
chmod +x ~/install-cryptobot-nginx.sh

# Run with sudo
sudo bash ~/install-cryptobot-nginx.sh
```

### Nginx test fails?
```bash
# Check nginx error log
sudo tail -n 50 /var/log/nginx/error.log

# Check syntax
sudo nginx -t
```

### Can't access /cryptobot?
```bash
# Check if bot is running
pm2 status

# Check if nginx is running
sudo systemctl status nginx

# Test from VPS itself
curl http://localhost:3001/
```

### 404 Not Found?
```bash
# Check nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Make sure nginx reloaded
sudo systemctl reload nginx
```

### SSL certificate issues?
```bash
# Check certificate validity
sudo certbot certificates

# Renew if needed
sudo certbot renew
```

---

## 📈 Performance Optimization (Optional)

### Enable Caching for CryptoBot:
```nginx
# Add to /cryptobot location block
proxy_cache_valid 200 1m;
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
```

### Enable Rate Limiting:
```nginx
# Add to http block
limit_req_zone $binary_remote_addr zone=cryptobot:10m rate=10r/s;

# Add to /cryptobot location
limit_req zone=cryptobot burst=20;
```

### Add Access Logging:
```nginx
# Add to /cryptobot location
access_log /var/log/nginx/cryptobot-access.log;
error_log /var/log/nginx/cryptobot-error.log;
```

---

## 🎉 Summary

### Before:
```
https://cestou.store          → Your Angular app ✅
https://cestou.store/api      → Your API ✅
http://72.60.56.80:3001       → CryptoBot ❌ (blocked)
```

### After:
```
https://cestou.store          → Your Angular app ✅
https://cestou.store/api      → Your API ✅
https://cestou.store/cryptobot → CryptoBot ✅ (accessible!)
```

---

## ⚡ Quick Commands

### Install:
```bash
ssh deploy@72.60.56.80
sudo bash ~/install-cryptobot-nginx.sh
```

### Test:
```bash
curl https://cestou.store/cryptobot/api/status
```

### Monitor:
```bash
pm2 logs cryptoBot
sudo tail -f /var/log/nginx/access.log
```

### Restart Bot:
```bash
pm2 restart cryptoBot
```

### Restart Nginx:
```bash
sudo systemctl restart nginx
```

---

## 📞 Need Help?

If you encounter any issues:

1. Check nginx logs:
   ```bash
   sudo tail -n 100 /var/log/nginx/error.log
   ```

2. Check bot logs:
   ```bash
   pm2 logs cryptoBot
   ```

3. Verify bot is running:
   ```bash
   pm2 status
   curl http://localhost:3001/api/status
   ```

4. Test nginx config:
   ```bash
   sudo nginx -t
   ```

---

**Ready to install?** Just run:

```bash
ssh deploy@72.60.56.80
sudo bash ~/install-cryptobot-nginx.sh
```

Then open: `https://cestou.store/cryptobot` 🚀
