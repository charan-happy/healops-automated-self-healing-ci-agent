// ═══════════════════════════════════════════════════════════════════════════════
// HealOps — PM2 Ecosystem Configuration
// Deploy: pm2 start ecosystem.config.js --env production
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    // ─── Frontend (Next.js) ──────────────────────────────────────────────────
    {
      name: 'healops-frontend',
      cwd: './apps/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_BACKEND_URL: 'https://healops.online/api',
        NEXT_PUBLIC_APP_URL: 'https://healops.online',
        NEXT_PUBLIC_APP_TITLE: 'HealOps',
        NEXT_PUBLIC_APP_NAME: 'HealOps',
        NEXT_PUBLIC_APP_ENV: 'production',
      },
      // Logging
      error_file: '/var/log/healops/frontend-error.log',
      out_file: '/var/log/healops/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ─── Backend API (NestJS) ────────────────────────────────────────────────
    {
      name: 'healops-backend',
      cwd: './apps/backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // Logging
      error_file: '/var/log/healops/backend-error.log',
      out_file: '/var/log/healops/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ─── Worker (BullMQ Queue Processor) ─────────────────────────────────────
    {
      name: 'healops-worker',
      cwd: './apps/backend',
      script: 'dist/worker.main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env_production: {
        NODE_ENV: 'production',
      },
      // Logging
      error_file: '/var/log/healops/worker-error.log',
      out_file: '/var/log/healops/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
