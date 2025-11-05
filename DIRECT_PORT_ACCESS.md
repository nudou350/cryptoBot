# Direct Port Access Setup

**Access your CryptoBot at:** `http://72.60.56.80:3001`

---

## 🚀 One Command Setup

SSH into your VPS and run:

```bash
ssh deploy@72.60.56.80
sudo bash ~/open-port-3001.sh
```

This will:
1. ✅ Open port 3001 in the firewall
2. ✅ Test the connection
3. ✅ Show you the access URL

---

## 🌐 Access URL

After running the script:

```
http://72.60.56.80:3001
```

That's it! Simple and direct.

---

## ✅ What the Script Does

```bash
# Opens port 3001 in firewall
sudo ufw allow 3001/tcp
sudo ufw reload
```

**Note:** Port 80 is already used by your cestou.store nginx, so CryptoBot uses port 3001.

---

## 🔍 Verification

After running the script, test in your browser:

```
http://72.60.56.80:3001
```

You should see: **🤖 Crypto Trading Bot Dashboard**

---

## 📊 API Endpoints

Once accessible, you can use these endpoints:

```
http://72.60.56.80:3001/api/status
http://72.60.56.80:3001/api/stats
http://72.60.56.80:3001/api/bots
```

---

## 🛠️ Manual Setup (Alternative)

If you prefer to do it manually:

```bash
ssh deploy@72.60.56.80

# Open port with UFW
sudo ufw allow 3001/tcp
sudo ufw reload

# Or with iptables
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables-save
```

---

## 🚨 Troubleshooting

### Can't access from browser?

**Check if port is open:**
```bash
ssh deploy@72.60.56.80
sudo ufw status | grep 3001
```

**Test from VPS:**
```bash
curl http://localhost:3001/api/status
```

**Check bot is running:**
```bash
pm2 status
```

### Still not working?

**Restart the bot:**
```bash
pm2 restart cryptoBot
```

**Check firewall:**
```bash
sudo ufw status
```

**Test port is listening:**
```bash
netstat -tuln | grep 3001
```

---

## 🔐 Security Notes

### Current Setup:
- ✅ Bot runs as non-root user (deploy)
- ✅ Environment variables in .env (not in Git)
- ⚠️  Port 3001 open to public (no authentication)

### Optional Security Enhancements:

**1. IP Whitelist (Recommended)**
Only allow your IP to access:
```bash
sudo ufw delete allow 3001/tcp
sudo ufw allow from YOUR_IP_ADDRESS to any port 3001
```

**2. Add HTTP Basic Auth**
Use nginx to add password protection (let me know if you want this)

**3. Use VPN**
Access via VPN tunnel for maximum security

---

## 📱 Mobile Access

You can access the dashboard from your phone too:
```
http://72.60.56.80:3001
```

The dashboard is responsive and works on mobile devices.

---

## 🔄 Auto-Deployment Still Works

Every push to GitHub main branch:
- ✅ Pulls latest code
- ✅ Builds project
- ✅ Restarts bot
- ✅ Dashboard updates

No changes needed - auto-deployment is already configured!

---

## 📋 Summary

### Before:
```
Bot running: ✅
Port 3001 listening: ✅
Firewall: ❌ Blocking
External access: ❌ Not available
```

### After Running Script:
```
Bot running: ✅
Port 3001 listening: ✅
Firewall: ✅ Open
External access: ✅ http://72.60.56.80:3001
```

---

## ⚡ Quick Start

**One command to open access:**
```bash
ssh deploy@72.60.56.80
sudo bash ~/open-port-3001.sh
```

**Then open in browser:**
```
http://72.60.56.80:3001
```

**Initialize and trade:**
1. Click "Initialize System"
2. Choose FAKE mode
3. Set budget: $500
4. Click "Start All Bots"
5. Watch it trade! 📈

---

## 🎉 That's It!

No nginx changes needed. No domain configuration. Just a simple firewall rule and you're done!

**Your bot is ready at:** `http://72.60.56.80:3001` 🚀
