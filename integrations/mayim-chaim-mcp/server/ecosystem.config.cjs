module.exports = {
  apps: [{
    name: 'mayim-chaim-mcp',
    script: './src/server.js',
    node_args: '--env-file=.env',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: { NODE_ENV: 'production' }
  }]
};
