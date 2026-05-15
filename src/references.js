import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export const DIM = 14;

/**
 * @param {Array<{ vector: number[], label: string }>} records
 * @returns {{ count: number, dim: number, vectors: Float32Array, labels: Uint8Array }}
 */
export function buildReferenceStore(records) {
  const count = records.length;
  const vectors = new Float32Array(count * DIM);
  
  const labels = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const rec = records[i];
    const v = rec.vector;
    if (v.length !== DIM) {
      throw new Error(`vector length ${v.length} !== ${DIM} at index ${i}`);
    }
    const off = i * DIM;
    for (let d = 0; d < DIM; d++) {
      vectors[off + d] = v[d];
    }
    labels[i] = rec.label === 'fraud' ? 1 : 0;
  }

  return { count, dim: DIM, vectors, labels };
}

/**
 * @param {string} jsonPath - ficheiro JSON array (ex.: example-references.json)
 */
export function loadReferencesFromJsonFile(jsonPath) {
  const text = readFileSync(jsonPath, 'utf8');
  const records = JSON.parse(text);
  const store = buildReferenceStore(records);
  return store;
}

/**
 * @param {string} gzipPath - .json.gz com o mesmo array que references.json
 */
export function loadReferencesFromGzipJsonFile(gzipPath) {
  const compressed = readFileSync(gzipPath);
  const text = gunzipSync(compressed).toString('utf8');
  const records = JSON.parse(text);
  const store = buildReferenceStore(records);
  return store;
}
