#!/bin/bash
# Oracle Cloud VM Setup Script for FlexForge Backend
# Run this on a fresh Oracle Cloud Ubuntu/Debian VM

set -e

echo "=== FlexForge Backend - Oracle Cloud Setup ==="

# Update system
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
rm get-docker.sh

# Install Docker Compose
echo "Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create app directory
echo "Creating application directory..."
sudo mkdir -p /opt/flexforge
sudo chown $USER:$USER /opt/flexforge

# Open firewall ports
echo "Configuring firewall..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Log out and back in (for docker group permissions)"
echo "2. Clone your repository to /opt/flexforge"
echo "3. Create .env.production file with your secrets"
echo "4. Run: docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "Don't forget to:"
echo "- Configure Oracle Cloud Security List to allow ports 80, 443, 3000"
echo "- Set up a domain and point it to your VM's public IP"
echo "- Consider setting up Caddy or Nginx for automatic HTTPS"
