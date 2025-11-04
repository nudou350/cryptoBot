# Quick Deployment Guide for Your VPS

**VPS:** `deploy@72.60.56.80`
**Target Directory:** `/var/www/cryptoBot`

---

## How It Works

Since you already have SSH keys set up on your VPS, you just need to:

1. Add GitHub Secrets (one-time setup)
2. Ensure VPS is ready
3. Push to main branch → Auto-deploys! 🚀

---

## Step 1: Add GitHub Secrets (5 minutes)

Go to your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

Add these **3 secrets**:

### Secret 1: VPS_HOST
```
Name: VPS_HOST
Value: 72.60.56.80
```

### Secret 2: VPS_USERNAME
```
Name: VPS_USERNAME
Value: deploy
```

### Secret 3: VPS_SSH_KEY
```
Name: VPS_SSH_KEY
Value: [Your private SSH key that matches the public key on the VPS]
```

To get your SSH key:
```bash
# On your local machine (the one you use to SSH into the VPS)
cat ~/.ssh/id_rsa
# OR
cat ~/.ssh/id_ed25519
```

Copy the **entire key** including `-----BEGIN` and `-----END` lines.

---

## Step 2: Prepare VPS (First time only)

SSH into your VPS and run these commands:

```bash
# SSH into VPS
ssh deploy@72.60.56.80

# Create directory
sudo mkdir -p /var/www/cryptoBot
sudo chown -R deploy:deploy /var/www

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Install PM2 (if not installed)
sudo npm install -g pm2

# Setup PM2 to start on boot
pm2 startup systemd

# Clone your repository
cd /var/www
git clone https://github.com/YOUR_USERNAME/cryptoBot.git cryptoBot
cd cryptoBot

# Install dependencies
npm install

# Create .env file
nano .env
```

Add this to `.env`:
```env
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_API_SECRET=your_api_secret_here
EXCHANGE_NAME=binance
TRADING_PAIR=BTC/USDT
TRADING_MODE=fake
INITIAL_CAPITAL=500
NODE_ENV=production
PORT=3001
```

Save and continue:
```bash
# Build project
npm run build

# Start with PM2
pm2 start dist/main.js --name cryptoBot
pm2 save
```

---

## Step 3: Deploy!

From now on, just push to main:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

GitHub Actions will automatically:
1. SSH into `deploy@72.60.56.80`
2. Pull latest code
3. Install dependencies
4. Build project
5. Restart bot

---

## Monitoring

```bash
# SSH into VPS
ssh deploy@72.60.56.80

# View logs
pm2 logs cryptoBot

# Check status
pm2 status

# View bot trading logs
tail -f /var/www/cryptoBot/logs/GridTrading-fake.log
```

---

## Troubleshooting

### If GitHub Actions fails:

1. **Check GitHub Actions logs**
   - Go to GitHub → Actions tab → Click on failed workflow

2. **Verify VPS is accessible**
   ```bash
   ssh deploy@72.60.56.80
   ```

3. **Check if directory exists**
   ```bash
   ls -la /var/www/cryptoBot
   ```

4. **Manual deployment**
   ```bash
   ssh deploy@72.60.56.80
   cd /var/www/cryptoBot
   git pull origin main
   npm install
   npm run build
   pm2 restart cryptoBot
   ```

---

## That's It!

Once setup is complete, you just need to:
- Code locally
- `git push origin main`
- Wait 1-2 minutes
- Bot is updated! ✅
