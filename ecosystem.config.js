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
      PORT: 3001
    }
  }]
};
