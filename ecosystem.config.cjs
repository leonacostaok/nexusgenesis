module.exports = {
  apps: [
    {
      name: 'nexusgenesis-genesis',
      script: 'src/index.js',
      cwd: '/opt/nexusgenesis',
      env: {
        NODE_ENV: 'production',
        P2P_PORT: '9847',
        HTTP_PORT: '19891',
        DATA_DIR: 'data/genesis',
        NODE_NAME: 'nexus-genesis',
        NODE_ROLE: 'genesis',
        SEED_NODES: ''
      },
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      log_file_size: '10M',
      retain_logs: 7,
      error_file: '/var/log/nexusgenesis/genesis-error.log',
      out_file: '/var/log/nexusgenesis/genesis-out.log',
      merge_logs: true
    },
    {
      name: 'nexusgenesis-monitor',
      script: 'scripts/start_monitor.js',
      cwd: '/opt/nexusgenesis',
      env: {
        NODE_ENV: 'production',
        ALERT_RULES_PATH: 'config/alert-rules.json',
        NOTIFICATION_FILE_DIR: '/var/log/nexusgenesis/alerts'
      },
      max_memory_restart: '200M',
      restart_delay: 10000,
      max_restarts: 5,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      log_file_size: '5M',
      retain_logs: 7,
      error_file: '/var/log/nexusgenesis/monitor-error.log',
      out_file: '/var/log/nexusgenesis/monitor-out.log',
      merge_logs: true,
      autorestart: true
    }
  ]
};
