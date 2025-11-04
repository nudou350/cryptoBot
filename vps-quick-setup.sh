#!/bin/bash
# One-command VPS setup for deploy@72.60.56.80
# Usage: ssh deploy@72.60.56.80 'bash -s' < vps-quick-setup.sh

set -e

echo "========================================="
echo "CryptoBot VPS Quick Setup"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create directory
echo -e "${GREEN}Creating /var/www/cryptoBot directory...${NC}"
sudo mkdir -p /var/www/cryptoBot
sudo chown -R deploy:deploy /var/www

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}Node.js already installed: $(node -v)${NC}"
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}PM2 already installed${NC}"
fi

# Setup PM2 startup
echo -e "${GREEN}Setting up PM2 startup...${NC}"
pm2 startup systemd -u deploy --hp /home/deploy | grep -v "PM2" | sudo bash || true

# Navigate to directory
cd /var/www

# Check if repository already exists
if [ -d "/var/www/cryptoBot/.git" ]; then
    echo -e "${GREEN}Repository already exists. Pulling latest changes...${NC}"
    cd cryptoBot
    git config pull.rebase false
    git pull origin main || echo -e "${YELLOW}Warning: Could not pull. Will continue...${NC}"
else
    echo -e "${YELLOW}Enter your GitHub repository URL:${NC}"
    echo -e "${YELLOW}Example: https://github.com/username/cryptoBot.git${NC}"
    read -r REPO_URL

    if [ -z "$REPO_URL" ]; then
        echo -e "${YELLOW}No URL provided. Skipping clone. You can clone manually.${NC}"
    else
        echo -e "${GREEN}Cloning repository...${NC}"
        git clone "$REPO_URL" cryptoBot
        cd cryptoBot
    fi
fi

# Only continue if we're in the cryptoBot directory
if [ -f "package.json" ]; then
    # Install dependencies
    echo -e "${GREEN}Installing dependencies...${NC}"
    npm install

    # Create .env if it doesn't exist
    if [ ! -f ".env" ]; then
        echo -e "${GREEN}Creating .env file...${NC}"
        cat > .env << 'EOL'
# Exchange API Configuration
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_API_SECRET=your_api_secret_here
EXCHANGE_NAME=binance

# Trading Configuration
TRADING_PAIR=BTC/USDT
TRADING_MODE=fake
INITIAL_CAPITAL=500

# Bot Configuration
NODE_ENV=production
PORT=3001
EOL
        echo -e "${YELLOW}⚠️  IMPORTANT: Edit /var/www/cryptoBot/.env with your API keys!${NC}"
    else
        echo -e "${GREEN}.env file already exists${NC}"
    fi

    # Build project
    echo -e "${GREEN}Building project...${NC}"
    npm run build

    # Check if bot is already running in PM2
    if pm2 list | grep -q cryptoBot; then
        echo -e "${GREEN}Restarting existing bot...${NC}"
        pm2 restart cryptoBot
    else
        echo -e "${GREEN}Starting bot with PM2...${NC}"
        pm2 start dist/main.js --name cryptoBot
    fi

    # Save PM2 configuration
    pm2 save

    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}Setup Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Edit .env: nano /var/www/cryptoBot/.env"
    echo "2. Add GitHub Secrets (see QUICK_DEPLOY_GUIDE.md)"
    echo "3. Push to main branch to trigger auto-deployment"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "pm2 logs cryptoBot    # View logs"
    echo "pm2 status            # Check status"
    echo "pm2 restart cryptoBot # Restart bot"
    echo ""
else
    echo -e "${YELLOW}Warning: package.json not found. Please clone the repository manually.${NC}"
fi

echo -e "${GREEN}=========================================${NC}"
