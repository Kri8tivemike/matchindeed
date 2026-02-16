#!/bin/bash
# =============================================================================
# MatchIndeed - CyberPanel Deployment Script
# =============================================================================
# Run this script from your LOCAL machine (in the webfiles directory).
# Prerequisites:
#   1. SSH key authentication set up: ssh-copy-id match-indeed@38.242.237.96
#   2. Or run and enter password when prompted
# =============================================================================

set -e

REMOTE_USER="match-indeed"
REMOTE_HOST="38.242.237.96"
REMOTE_PATH="/home/match-indeed/matchindeed"  # Adjust if your server uses different path
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== MatchIndeed CyberPanel Deployment ==="
echo "Local dir: $LOCAL_DIR"
echo "Remote: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
echo ""

# Step 1: Build locally
echo "[1/5] Building Next.js app..."
cd "$LOCAL_DIR"
npm run build

# Step 2: Create deployment archive (exclude node_modules, .git, etc.)
echo "[2/5] Creating deployment archive..."
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.next' \
    --exclude='*.log' \
    --exclude='.env.local' \
    -czf /tmp/matchindeed-deploy.tar.gz .

# Step 3: Copy to server
echo "[3/5] Uploading to server..."
scp /tmp/matchindeed-deploy.tar.gz "$REMOTE_USER@$REMOTE_HOST:/tmp/"

# Step 4: Extract and setup on server
echo "[4/5] Extracting and installing on server..."
ssh "$REMOTE_USER@$REMOTE_HOST" << 'ENDSSH'
set -e
DEPLOY_DIR="/home/match-indeed/matchindeed"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
tar -xzf /tmp/matchindeed-deploy.tar.gz -C .
rm /tmp/matchindeed-deploy.tar.gz

# Install dependencies and rebuild on server (ensures correct platform)
if command -v npm &> /dev/null; then
  npm install --production=false
  npm run build
else
  echo "WARNING: Node.js not found on server. Install Node.js first."
  exit 1
fi
ENDSSH

# Step 5: Restart PM2 (if already set up)
echo "[5/5] Restarting app (PM2)..."
ssh "$REMOTE_USER@$REMOTE_HOST" << 'ENDSSH'
if command -v pm2 &> /dev/null; then
  cd /home/match-indeed/matchindeed
  pm2 restart matchindeed 2>/dev/null || pm2 start npm --name "matchindeed" -- start
  pm2 save
else
  echo "PM2 not installed. Run: npm install -g pm2"
  echo "Then: pm2 start npm --name matchindeed -- start"
fi
ENDSSH

echo ""
echo "=== Deployment complete ==="
echo "App should be running. Ensure Nginx reverse proxy points to port 3000."
echo "Check: ssh $REMOTE_USER@$REMOTE_HOST 'pm2 status'"
