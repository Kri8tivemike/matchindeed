# MatchIndeed — CyberPanel Deployment Guide

## Quick Deploy (Automated Script)

### 1. Set up SSH key (one-time)

```bash
# Generate key if you don't have one
ssh-keygen -t ed25519 -C "your@email.com"

# Copy your key to the server (enter password when prompted)
ssh-copy-id match-indeed@38.242.237.96
```

### 2. Run the deployment script

```bash
cd webfiles
chmod +x scripts/deploy-cyberpanel.sh
./scripts/deploy-cyberpanel.sh
```

---

## Manual Deployment

### Step 1: SSH into server

```bash
ssh match-indeed@38.242.237.96
```

### Step 2: Install Node.js (if not installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
node -v   # Should show v20.x
```

### Step 3: Create app directory

```bash
mkdir -p ~/matchindeed
cd ~/matchindeed
```

### Step 4: Upload your project

**Option A — From your Mac (in a new terminal):**

```bash
cd /path/to/match-Indeed-app/webfiles
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.next' \
  . match-indeed@38.242.237.96:~/matchindeed/
```

**Option B — Use Git (if your repo is on GitHub):**

```bash
# On server
cd ~/matchindeed
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .
```

**Option C — Use CyberPanel File Manager:**

1. Zip your project locally (exclude `node_modules`, `.git`, `.next`)
2. CyberPanel → matchindeed.com → File Manager
3. Upload and extract to the correct directory

### Step 5: Build and run on server

```bash
cd ~/matchindeed
npm install
npm run build
```

### Step 6: Create .env.production

```bash
nano .env.production
# Paste your env vars from .env.local (Supabase, Stripe, Postmark, etc.)
# Set NEXT_PUBLIC_APP_URL=https://matchindeed.com
```

### Step 7: Start with PM2

```bash
npm install -g pm2
pm2 start npm --name "matchindeed" -- start
pm2 save
pm2 startup systemd   # Run the command it outputs
```

### Step 8: Configure Nginx reverse proxy (CyberPanel)

1. Websites → List Websites → matchindeed.com → **Vhost**
2. Add proxy configuration to forward requests to `http://127.0.0.1:3000`
3. Restart Nginx

### Step 9: SSL (CyberPanel)

1. SSL/TLS tab → Issue SSL
2. Select Let's Encrypt

---

## Server Details

| Item | Value |
|------|-------|
| SSH User | match-indeed |
| Server IP | 38.242.237.96 |
| SSH Port | 22 |
| Home Dir | /home/match-indeed/ |
| Domain Root | /home/matchindeed/htdocs/matchindeed.com (may vary) |

---

## Troubleshooting

- **Port 3000 not responding:** Ensure PM2 is running: `pm2 status`
- **502 Bad Gateway:** Check Nginx proxy points to 127.0.0.1:3000
- **Env vars not loading:** Use `.env.production` and restart PM2: `pm2 restart matchindeed`
