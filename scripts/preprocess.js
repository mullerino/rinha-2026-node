import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');

const records = JSON.parse(
  fs.readFileSync(join(dataDir, 'references.json'), 'utf8'),
);

const DIM = 14;

const vectors = new Float32Array(records.length * DIM);
const labels = new Uint8Array(records.length);

for (let i = 0; i < records.length; i++) {
  const record = records[i];

  for (let d = 0; d < DIM; d++) {
    vectors[i * DIM + d] = record.vector[d];
  }

  labels[i] = record.label === 'fraud' ? 1 : 0;
}

fs.writeFileSync(
  join(dataDir, 'vectors.bin'),
  Buffer.from(vectors.buffer),
);

fs.writeFileSync(
  join(dataDir, 'labels.bin'),
  Buffer.from(labels.buffer),
);
