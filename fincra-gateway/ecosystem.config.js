module.exports = {
  apps: [
    {
      name: "fincra-gateway",
      script: "./server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 4000
      },
      error_file: "/var/log/fincra-gateway/pm2-error.log",
      out_file: "/var/log/fincra-gateway/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true
    }
  ]
};
