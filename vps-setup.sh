#!/bin/bash

# VPS Setup Script for CryptoBot Auto-Deployment
# Run this script on your VPS to prepare for GitHub Actions deployment

set -e

echo "==================================="
echo "CryptoBot VPS Setup Script"
echo "==================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo bash vps-setup.sh"
    exit 1
fi

# Update system
echo "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js and npm (if not already installed)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "Node.js already installed: $(node -v)"
fi

# Install PM2 globally (if not already installed)
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
else
    echo "PM2 already installed: $(pm2 -v)"
fi

# Setup PM2 to start on boot
echo "Setting up PM2 startup..."
pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER
systemctl enable pm2-$SUDO_USER

# Create project directory
echo "Creating project directory..."
mkdir -p /var/www/cryptoBot
chown -R $SUDO_USER:$SUDO_USER /var/www

# Clone repository (you'll need to add your GitHub repo URL)
echo "Enter your GitHub repository URL (e.g., https://github.com/username/cryptoBot.git):"
read -r REPO_URL

if [ -d "/var/www/cryptoBot/.git" ]; then
    echo "Repository already exists. Pulling latest changes..."
    cd /var/www/cryptoBot
    sudo -u $SUDO_USER git pull origin main
else
    echo "Cloning repository..."
    cd /var/www
    sudo -u $SUDO_USER git clone "$REPO_URL" cryptoBot
    cd cryptoBot
fi

# Setup Git configuration
echo "Configuring Git..."
sudo -u $SUDO_USER git config pull.rebase false

# Install dependencies
echo "Installing project dependencies..."
sudo -u $SUDO_USER npm install

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOL
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
    chown $SUDO_USER:$SUDO_USER .env
    echo "⚠️  IMPORTANT: Edit /var/www/cryptoBot/.env with your actual API keys!"
fi

# Build the project
echo "Building project..."
sudo -u $SUDO_USER npm run build

echo ""
echo "==================================="
echo "VPS Setup Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Edit /var/www/cryptoBot/.env with your API keys"
echo "2. Add the following secrets to your GitHub repository:"
echo "   - VPS_HOST: Your VPS IP address or domain"
echo "   - VPS_USERNAME: Your SSH username (likely: $SUDO_USER)"
echo "   - VPS_SSH_KEY: Your private SSH key"
echo "   - VPS_PORT: SSH port (default: 22)"
echo ""
echo "To start the bot manually:"
echo "   cd /var/www/cryptoBot"
echo "   pm2 start dist/main.js --name cryptoBot"
echo "   pm2 save"
echo ""
echo "To view logs:"
echo "   pm2 logs cryptoBot"
echo ""
echo "GitHub Actions will now auto-deploy on every push to main!"
echo "==================================="
