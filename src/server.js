import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classify } from './classify.js';
import { loadReferencesFromBinaryFiles } from './references.js';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, '..', 'data');

const normalization = JSON.parse(
  readFileSync(join(dataDir, 'normalization.json'), 'utf8'),
);
const mccRisk = JSON.parse(readFileSync(join(dataDir, 'mcc_risk.json'), 'utf8'));

console.error('Carregando references.json.gz…');
const store = loadReferencesFromBinaryFiles(
  join(dataDir, 'references.json.gz'),
);
console.error(`Pronto: ${store.count} vetores.`);

const port = 9999;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/ready') {
      res.writeHead(200, { 'Content-Length': '0' });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/fraud-score') {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);
      const out = classify(payload, normalization, mccRisk, store);
      const body = JSON.stringify(out);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'Content-Length': '0' });
    res.end();
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.error(`Listening on :${port}`);
});
