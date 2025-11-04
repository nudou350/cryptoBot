# CryptoBot Auto-Deployment Guide

This guide will help you set up automatic deployment from GitHub to your VPS.

## Prerequisites

- A VPS with SSH access
- GitHub repository with your code
- Node.js 18+ on VPS
- PM2 process manager

## Deployment Architecture

```
GitHub (main branch)
    ↓ (on commit)
GitHub Actions
    ↓ (SSH connection)
VPS (/var/www/cryptoBot)
    ↓
PM2 restart
    ↓
Bot Running
```

---

## Step 1: Prepare Your VPS

### 1.1 Upload Setup Script to VPS

```bash
# On your local machine
scp vps-setup.sh user@your-vps-ip:/tmp/

# Or copy the content and create it directly on VPS
ssh user@your-vps-ip
nano /tmp/vps-setup.sh
# Paste the content and save
```

### 1.2 Run Setup Script on VPS

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Make script executable
chmod +x /tmp/vps-setup.sh

# Run the setup script
sudo bash /tmp/vps-setup.sh
```

The script will:
- Install Node.js and PM2
- Create `/var/www/cryptoBot` directory
- Clone your repository
- Install dependencies
- Build the project
- Create a template `.env` file

### 1.3 Configure Environment Variables

```bash
# Edit the .env file with your actual credentials
sudo nano /var/www/cryptoBot/.env
```

Required variables:
```env
EXCHANGE_API_KEY=your_actual_api_key
EXCHANGE_API_SECRET=your_actual_api_secret
EXCHANGE_NAME=binance
TRADING_PAIR=BTC/USDT
TRADING_MODE=fake  # or 'real' for live trading
INITIAL_CAPITAL=500
NODE_ENV=production
PORT=3001
```

### 1.4 Test Manual Start

```bash
cd /var/www/cryptoBot
pm2 start dist/main.js --name cryptoBot
pm2 save
pm2 logs cryptoBot
```

---

## Step 2: Generate SSH Key for GitHub Actions

### 2.1 Create SSH Key on VPS

```bash
# On your VPS
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions

# View the public key
cat ~/.ssh/github-actions.pub

# Add it to authorized_keys
cat ~/.ssh/github-actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# View the private key (you'll need this for GitHub)
cat ~/.ssh/github-actions
```

**IMPORTANT:** Copy the entire private key (including `-----BEGIN` and `-----END` lines)

---

## Step 3: Configure GitHub Secrets

### 3.1 Navigate to Repository Settings

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

### 3.2 Add Required Secrets

Add these 4 secrets:

#### VPS_HOST
- **Name:** `VPS_HOST`
- **Value:** Your VPS IP address or domain (e.g., `192.168.1.100` or `myserver.com`)

#### VPS_USERNAME
- **Name:** `VPS_USERNAME`
- **Value:** Your SSH username (e.g., `ubuntu`, `root`, or your user)

#### VPS_SSH_KEY
- **Name:** `VPS_SSH_KEY`
- **Value:** The entire private key from step 2.1
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz...
... (paste entire key)
-----END OPENSSH PRIVATE KEY-----
```

#### VPS_PORT (Optional)
- **Name:** `VPS_PORT`
- **Value:** `22` (or your custom SSH port)

---

## Step 4: Test Auto-Deployment

### 4.1 Commit and Push to Main

```bash
# On your local machine
git add .
git commit -m "Setup auto-deployment"
git push origin main
```

### 4.2 Monitor GitHub Actions

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see a workflow running: "Deploy to VPS"
4. Click on it to view logs

### 4.3 Check Deployment on VPS

```bash
# SSH into VPS
ssh user@your-vps-ip

# Check PM2 status
pm2 status

# View logs
pm2 logs cryptoBot

# Check if bot is running
cd /var/www/cryptoBot
ls -la logs/
```

---

## Step 5: Managing Your Bot

### View Logs
```bash
# Real-time logs
pm2 logs cryptoBot

# View specific log file
tail -f /var/www/cryptoBot/logs/GridTrading-fake.log
```

### Restart Bot
```bash
pm2 restart cryptoBot
```

### Stop Bot
```bash
pm2 stop cryptoBot
```

### Delete Bot from PM2
```bash
pm2 delete cryptoBot
```

### View PM2 Status
```bash
pm2 status
pm2 monit
```

---

## Workflow Triggers

The deployment will automatically trigger when:
- ✅ You push commits to `main` branch
- ✅ You merge a pull request to `main`

The deployment will NOT trigger when:
- ❌ You push to other branches
- ❌ You create a pull request (but not merge it)

---

## Troubleshooting

### Issue: GitHub Actions fails with "Permission denied"

**Solution:**
- Check that the SSH key is correct in GitHub secrets
- Verify the key is in `~/.ssh/authorized_keys` on VPS
- Check SSH permissions: `chmod 600 ~/.ssh/authorized_keys`

### Issue: "pm2: command not found"

**Solution:**
```bash
npm install -g pm2
pm2 update
```

### Issue: Build fails on VPS

**Solution:**
```bash
cd /var/www/cryptoBot
npm install
npm run build
```

### Issue: Bot starts but crashes immediately

**Solution:**
- Check logs: `pm2 logs cryptoBot`
- Verify `.env` file has correct API keys
- Check if port 3001 is available: `npx kill-port 3001`

### Issue: Git pull fails with "uncommitted changes"

**Solution:**
```bash
cd /var/www/cryptoBot
git stash
git pull origin main
```

---

## Security Best Practices

### 1. Protect Your SSH Keys
- ✅ Never commit SSH keys to Git
- ✅ Use GitHub Secrets for sensitive data
- ✅ Restrict SSH key permissions: `chmod 600 ~/.ssh/github-actions`

### 2. Protect Your API Keys
- ✅ Never commit `.env` to Git (it's in `.gitignore`)
- ✅ Use separate API keys for testing and production
- ✅ Enable IP whitelist on exchange if possible

### 3. Monitor Your Bot
- ✅ Set up alerts for PM2: `pm2 install pm2-logrotate`
- ✅ Monitor system resources: `pm2 monit`
- ✅ Review logs regularly: `pm2 logs cryptoBot`

### 4. Firewall Configuration
```bash
# Allow only SSH and your app port
sudo ufw allow 22/tcp
sudo ufw allow 3001/tcp
sudo ufw enable
```

---

## Monitoring and Maintenance

### Log Rotation
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### System Monitoring
```bash
# CPU and Memory usage
pm2 monit

# Process status
pm2 status

# Application info
pm2 info cryptoBot
```

### Backup Strategy
```bash
# Backup logs
cp -r /var/www/cryptoBot/logs ~/backup/logs-$(date +%Y%m%d)

# Backup .env
cp /var/www/cryptoBot/.env ~/backup/.env-$(date +%Y%m%d)
```

---

## Deployment Flow

```
Developer
    ↓
git commit -m "Update strategy"
    ↓
git push origin main
    ↓
GitHub receives push
    ↓
GitHub Actions triggers
    ↓
SSH into VPS
    ↓
cd /var/www/cryptoBot
    ↓
git pull origin main
    ↓
npm install
    ↓
npm run build
    ↓
pm2 restart cryptoBot
    ↓
Bot running with new code
```

---

## Quick Reference Commands

### Local Development
```bash
npm run start:dev          # Development mode
npm run build              # Build project
npm run test               # Run tests
git push origin main       # Deploy to VPS
```

### VPS Management
```bash
cd /var/www/cryptoBot      # Go to project
pm2 logs cryptoBot         # View logs
pm2 restart cryptoBot      # Restart bot
pm2 status                 # Check status
tail -f logs/*.log         # View bot logs
```

---

## Support

If you encounter issues:
1. Check GitHub Actions logs
2. Check PM2 logs: `pm2 logs cryptoBot`
3. Check bot logs: `tail -f /var/www/cryptoBot/logs/*.log`
4. Review this guide
5. Check file permissions: `ls -la /var/www/cryptoBot`

---

## Summary

After setup, your deployment workflow is:
1. Write code locally
2. Commit and push to main
3. GitHub Actions automatically deploys
4. Bot restarts on VPS
5. Monitor with PM2

**No manual deployment needed!** 🚀

---

Last Updated: 2025-01-04
