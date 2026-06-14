#!/usr/bin/env node

import { bootstrap } from '../src/bootstrap/index.js';

console.log('[Bootstrap Script] Starting bootstrap mode on the unified GenesisNode runtime');

bootstrap().catch(err => {
  console.error('❌ Bootstrap failed:', err.message);
  process.exit(1);
});
