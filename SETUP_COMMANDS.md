# Setup Commands for deploy@72.60.56.80

Copy and paste these commands to set up auto-deployment.

---

## IMPORTANT: I Cannot SSH Into Your VPS

GitHub Actions will SSH into your VPS automatically when you push code. I've created all the necessary files - you just need to:
1. Run the setup script on your VPS (below)
2. Add 3 GitHub secrets (below)
3. Push to main branch → Auto-deploys! ✅

---

## Option 1: One-Command Setup (Easiest)

Run this **on your local machine**:

```bash
ssh deploy@72.60.56.80 'bash -s' < vps-quick-setup.sh
```

This will:
- ✅ Create `/var/www/cryptoBot` directory
- ✅ Install Node.js and PM2
- ✅ Clone your repository
- ✅ Install dependencies
- ✅ Build the project
- ✅ Start the bot

---

## Option 2: Manual Setup

### Step 1: SSH into VPS
```bash
ssh deploy@72.60.56.80
```

### Step 2: Run these commands
```bash
# Create directory
sudo mkdir -p /var/www/cryptoBot
sudo chown -R deploy:deploy /var/www

# Install Node.js (if needed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Setup PM2 startup
pm2 startup systemd

# Clone repository (replace YOUR_USERNAME)
cd /var/www
git clone https://github.com/YOUR_USERNAME/cryptoBot.git cryptoBot
cd cryptoBot

# Install and build
npm install
npm run build

# Create .env file
nano .env
```

### Step 3: Add to .env
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

### Step 4: Start bot
```bash
pm2 start dist/main.js --name cryptoBot
pm2 save
```

---

## Add GitHub Secrets

Go to: **GitHub → Your Repo → Settings → Secrets and variables → Actions → New repository secret**

### Add These 3 Secrets:

#### 1. VPS_HOST
```
Name: VPS_HOST
Value: 72.60.56.80
```

#### 2. VPS_USERNAME
```
Name: VPS_USERNAME
Value: deploy
```

#### 3. VPS_SSH_KEY
**Get your SSH key** (run on your local machine):
```bash
cat ~/.ssh/id_rsa
```
OR
```bash
cat ~/.ssh/id_ed25519
```

Copy the **entire output** (including BEGIN/END lines) and paste as the secret value.

---

## Test Auto-Deployment

After adding the 3 GitHub secrets:

```bash
# On your local machine
git add .
git commit -m "Test auto-deployment"
git push origin main
```

Then:
1. Go to GitHub → Actions tab
2. Watch the deployment run
3. SSH to VPS and check: `pm2 logs cryptoBot`

---

## Daily Usage

Once setup is complete, you just:

```bash
# Make changes to code
git add .
git commit -m "Updated trading strategy"
git push origin main

# Bot automatically updates on VPS! 🚀
```

---

## Monitoring Commands

```bash
# SSH into VPS
ssh deploy@72.60.56.80

# View real-time logs
pm2 logs cryptoBot

# Check status
pm2 status

# View bot trading logs
tail -f /var/www/cryptoBot/logs/GridTrading-fake.log

# Restart bot manually
pm2 restart cryptoBot
```

---

## Troubleshooting

### GitHub Actions fails?
1. Check you added all 3 GitHub secrets correctly
2. Verify SSH key is correct: `ssh deploy@72.60.56.80` (should work without password)
3. Check GitHub Actions logs for error details

### Bot not starting?
```bash
ssh deploy@72.60.56.80
cd /var/www/cryptoBot
pm2 logs cryptoBot
```

### Port already in use?
```bash
ssh deploy@72.60.56.80
npx kill-port 3001
pm2 restart cryptoBot
```

---

## Summary

**Setup (once):**
1. Run setup script OR manual commands
2. Add 3 GitHub secrets
3. Edit .env on VPS

**Daily workflow:**
1. Code locally
2. `git push origin main`
3. Bot auto-updates ✅

That's it! 🎉
