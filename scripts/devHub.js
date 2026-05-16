/**
 * NexusGenesis - Agent Hub Dev Server (Standalone)
 * Minimal HTTP server for Agent Hub development and preview
 * Usage: node scripts/devHub.js
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import agentHubRoutes from '../src/http/routes/agentHub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 19891;

app.use((req, res, next) => {
  console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/v1/hub', agentHubRoutes);

app.get('/agent-hub', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'agent-hub.html'));
});

app.get('/', (req, res) => {
  res.redirect('/agent-hub.html');
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('========================================');
  console.log('  NexusGenesis Agent Hub - Dev Server');
  console.log('========================================');
  console.log(`  URL: http://localhost:${PORT}/agent-hub.html`);
  console.log(`  API: http://localhost:${PORT}/api/v1/hub`);
  console.log('========================================');
  console.log('');
});