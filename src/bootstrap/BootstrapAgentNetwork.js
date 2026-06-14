/**
 * @deprecated This module is legacy code. The main Express server in src/http/server.js
 * now handles all bootstrap API routes via src/http/routes/bootstrapApi.js.
 * This file is kept for reference only and should not be used in production.
 * See: npm start → GenesisNode + Express HTTP (the unified mainline)
 */
import { existsSync, readFileSync, mkdirSync } from 'fs';