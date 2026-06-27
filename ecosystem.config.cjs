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
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'nexusgenesis-node02',
      script: 'src/index.js',
      cwd: '/opt/nexusgenesis',
      env: {
        NODE_ENV: 'production',
        P2P_PORT: '9848',
        HTTP_PORT: '19892',
        DATA_DIR: 'data/node02',
        NODE_NAME: 'nexus-node02',
        NODE_ROLE: 'peer',
        // SEED_NODES disabled: node02 chain forked (52644 vs genesis 1696) and
        // handshake signature verification fails against genesis. Running
        // standalone to avoid RecoveryManager death-loop (peers=0 -> reconnect
        // -> peers=0). Re-enable after P2P handshake key mismatch is fixed.
        SEED_NODES: '',
        ALLOW_SINGLE_NODE_BLOCKS: '1'
      },
      max_memory_restart: '400M',
      restart_delay: 5000,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'nexusgenesis-node03',
      script: 'src/index.js',
      cwd: '/opt/nexusgenesis',
      env: {
        NODE_ENV: 'production',
        P2P_PORT: '9849',
        HTTP_PORT: '19893',
        DATA_DIR: 'data/node03',
        NODE_NAME: 'nexus-node03',
        NODE_ROLE: 'peer',
        SEED_NODES: 'ws://127.0.0.1:9847'
      },
      max_memory_restart: '400M',
      restart_delay: 5000,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};