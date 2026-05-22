#!/usr/bin/env node

import { bootstrap } from '../src/bootstrap/index.js';

bootstrap().catch(err => {
  console.error('❌ Bootstrap failed:', err.message);
  process.exit(1);
});