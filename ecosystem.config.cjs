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
        SEED_NODES: '',
        NG_CUSTODY_TOKEN_SECRET: '+CNJ1OsQ8QdV1lQ+R4Gubi/eoCWMTrhTEvQslB3I4CVY+cf/F7Z4CprpmdTwVAlK',
        NG_ADMIN_ALLOW_IN_PRODUCTION: '0',
        // 32-byte AES master key, base64 encoded, used to encrypt all
        // agent private keys at rest. Source of truth in production;
        // data/wallets/.wallet_master_key is dev-only fallback.
        NG_WALLET_MASTER_KEY: 'ZkwtU4HCN7eb1LlsVDfZI1ZS3DlxCHdfafJJqZVDksQ='
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
