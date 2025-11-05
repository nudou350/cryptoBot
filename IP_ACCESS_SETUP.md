# CryptoBot IP Access Setup

**Your Smart Solution:** Use nginx on port 80 to route IP traffic to the bot!

---

## 🎯 The Setup

```
cestou.store    → Your Angular app (port 80)
72.60.56.80     → CryptoBot dashboard (port 80 → proxies to 3001)
```

**Benefits:**
- ✅ No new ports to open (uses existing port 80)
- ✅ Clean URL: `http://72.60.56.80`
- ✅ More secure (port 3001 stays internal)
- ✅ Domains and IPs completely separate
- ✅ Simple nginx routing

---

## 🚀 Installation (One Command!)

SSH into your VPS and run:

```bash
ssh deploy@72.60.56.80
sudo bash ~/install-cryptobot-ip.sh
```

That's it! ✅

---

## 🌐 Access After Installation

### Your CryptoBot:
```
http://72.60.56.80
```

### Your Existing App (Unchanged):
```
https://cestou.store        → Angular app ✅
https://cestou.store/api    → API ✅
```

---

## 🔧 How It Works

### Nginx Routing Logic:
```nginx
Request to "cestou.store" → Angular app
Request to "72.60.56.80"  → CryptoBot (proxy to localhost:3001)
```

### Architecture:
```
Internet
    ↓
Nginx (Port 80)
    ↓
    ├─ Host: cestou.store → /var/www/cestou
    └─ Host: 72.60.56.80  → localhost:3001 (CryptoBot)
```

### Security:
```
Port 80:   ✅ Open (already was)
Port 3001: ✅ Closed to public (internal only)
Port 443:  ✅ Open for SSL (cestou.store)

Port 3001 is only accessible via localhost!
```

---

## 📋 What Gets Installed

### New Nginx Config:
**File:** `/etc/nginx/sites-available/cryptobot`

```nginx
upstream cryptobot_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name 72.60.56.80;

    location / {
        proxy_pass http://cryptobot_backend;
        # ... proxy settings ...
    }
}
```

### What's NOT Changed:
- ✅ Your cestou.store config stays the same
- ✅ SSL certificates unchanged
- ✅ No firewall changes
- ✅ No existing routes affected

---

## ✅ Verification

After running the installation script:

### 1. Check Access
Open in browser:
```
http://72.60.56.80
```

You should see: **🤖 Crypto Trading Bot Dashboard**

### 2. Verify Existing App Still Works
```
https://cestou.store
```

Should still show your Angular app ✅

### 3. Test API
```bash
curl http://72.60.56.80/api/status
```

Should return:
```json
{"success":true,"initialized":false,"running":false}
```

### 4. Verify Port 3001 is NOT Public
```bash
# From another computer, this should FAIL:
curl http://72.60.56.80:3001
# Connection refused or timeout

# But this should WORK:
curl http://72.60.56.80
```

---

## 🔒 Security Benefits

### Before (Opening Port 3001):
```
❌ Port 3001 open to internet
❌ Direct access to bot (no proxy)
❌ Another attack surface
❌ Need firewall rules
```

### After (Using Nginx Proxy):
```
✅ Port 3001 stays closed
✅ Nginx handles requests (rate limiting, logging)
✅ Can add authentication later
✅ No new ports opened
✅ Professional setup
```

---

## 🛠️ Optional Enhancements

### 1. Add Rate Limiting
```nginx
# Protect against abuse
limit_req_zone $binary_remote_addr zone=cryptobot:10m rate=10r/s;

location / {
    limit_req zone=cryptobot burst=20;
    # ... rest of config ...
}
```

### 2. Add IP Whitelist
```nginx
# Only allow specific IPs
location / {
    allow 123.45.67.89;  # Your IP
    deny all;
    # ... rest of config ...
}
```

### 3. Add HTTP Basic Auth
```bash
# Create password file
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd cryptobot

# Add to nginx config:
location / {
    auth_basic "CryptoBot Dashboard";
    auth_basic_user_file /etc/nginx/.htpasswd;
    # ... rest of config ...
}
```

### 4. Add SSL (HTTPS)
```bash
# Get free SSL certificate for IP (self-signed)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/cryptobot.key \
  -out /etc/ssl/certs/cryptobot.crt

# Update nginx to use SSL
# Access via: https://72.60.56.80
```

---

## 🚨 Troubleshooting

### Can't access http://72.60.56.80?

**Check nginx status:**
```bash
sudo systemctl status nginx
```

**Check nginx logs:**
```bash
sudo tail -f /var/log/nginx/cryptobot-error.log
```

**Test nginx config:**
```bash
sudo nginx -t
```

**Reload nginx:**
```bash
sudo systemctl reload nginx
```

### Getting 502 Bad Gateway?

**Check if bot is running:**
```bash
pm2 status
```

**Check bot logs:**
```bash
pm2 logs cryptoBot
```

**Restart bot:**
```bash
pm2 restart cryptoBot
```

### cestou.store not working?

**Check nginx config:**
```bash
sudo nginx -t
```

**View all enabled sites:**
```bash
ls -la /etc/nginx/sites-enabled/
```

**Restart nginx:**
```bash
sudo systemctl restart nginx
```

---

## 🔄 How to Uninstall

If you want to remove this setup:

```bash
# Remove nginx config
sudo rm /etc/nginx/sites-enabled/cryptobot
sudo rm /etc/nginx/sites-available/cryptobot

# Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

Your cestou.store app won't be affected.

---

## 📊 URL Routing Summary

### After Installation:

| URL | Destination | Port | SSL |
|-----|-------------|------|-----|
| `cestou.store` | Angular App | 443 | ✅ |
| `cestou.store/api` | Cestou API | 443 | ✅ |
| `72.60.56.80` | CryptoBot | 80 | ❌ |

### Internal Routing:

| Service | Internal Port | Public Access |
|---------|---------------|---------------|
| Angular App | N/A | Via nginx |
| Cestou API | 3000 | Via nginx (SSL) |
| CryptoBot | 3001 | Via nginx (IP only) |

---

## 🎉 Advantages of This Approach

### vs. Opening Port 3001:
- ✅ More secure (one less open port)
- ✅ Cleaner URL (no :3001)
- ✅ Nginx features (rate limiting, logging, auth)
- ✅ Professional setup

### vs. Subdomain (bot.cestou.store):
- ✅ Keeps domain separate
- ✅ Simpler DNS management
- ✅ No domain configuration needed

### vs. SSH Tunnel:
- ✅ Always accessible (no tunnel needed)
- ✅ Works from any device
- ✅ Easier for users

---

## 💡 Perfect Use Cases

This setup is ideal if you:
- ✅ Want simple access without opening extra ports
- ✅ Don't want to use your domain for the bot
- ✅ Want to keep things separate
- ✅ Need a clean, professional URL
- ✅ Want better security than direct port access

---

## ⚡ Quick Commands

### Install:
```bash
ssh deploy@72.60.56.80
sudo bash ~/install-cryptobot-ip.sh
```

### Access:
```
http://72.60.56.80
```

### Monitor:
```bash
pm2 logs cryptoBot
sudo tail -f /var/log/nginx/cryptobot-access.log
```

### Restart:
```bash
pm2 restart cryptoBot
sudo systemctl reload nginx
```

---

## 🎊 After Setup

Once installed:

1. **Open in browser:**
   ```
   http://72.60.56.80
   ```

2. **Initialize bot:**
   - Click "Initialize System"
   - Choose FAKE mode
   - Set budget: $500

3. **Start trading:**
   - Click "Start All Bots"
   - Watch real-time stats
   - Monitor trades

4. **Auto-deployment works:**
   - Push to GitHub → auto-updates ✅

---

## 📝 Summary

**Your Smart Solution:**
- Uses existing open port (80)
- Clean URL (http://72.60.56.80)
- More secure (port 3001 internal only)
- Completely separate from cestou.store
- One command installation

**This is exactly what you asked for!** 🎯

---

**Ready to install?**

```bash
ssh deploy@72.60.56.80
sudo bash ~/install-cryptobot-ip.sh
```

Then open: `http://72.60.56.80` 🚀
