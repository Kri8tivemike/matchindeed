/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function getEnvValue(key) {
  const fileCandidates = [".env.local", ".env"];
  for (const fileName of fileCandidates) {
    const fullPath = path.join(__dirname, fileName);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const [name, ...rest] = line.split("=");
      if (name === key) {
        return rest.join("=").trim();
      }
    }
  }
  return undefined;
}

const cronSecret = process.env.CRON_SECRET || getEnvValue("CRON_SECRET");

module.exports = {
  apps: [{
    name: 'matchindeed',
    script: 'npm',
    args: 'start',
    cwd: '/home/matchindeed/htdocs/matchindeed.com',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      ...(cronSecret ? { CRON_SECRET: cronSecret } : {}),
    }
  }]
};
