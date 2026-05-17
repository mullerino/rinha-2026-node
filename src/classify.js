import {
  decisionFromFraudScore,
  findTopKNeighborIndicesBucketedSquared,
  findTopKNeighborIndicesSquared,
  fraudScoreFromNeighbors,
} from './knn.js';
import { vectorize } from './vectorize.js';

/**
 * Classificação k-NN (k=5) + regra oficial de aprovação.
 * @param {unknown} payload
 * @param {Record<string, number>} normalization
 * @param {Record<string, number>} mccRisk
 * @param {{ count: number, dim: number, vectors: Float32Array, labels: Uint8Array, bucketIndex?: unknown }} store
 * @returns {{ approved: boolean, fraud_score: number }}
 */
export function classify(payload, normalization, mccRisk, store) {
  const q = vectorize(payload, normalization, mccRisk);
  const searchIndex = process.env.SEARCH_INDEX || 'bucketed';
  const neighbors = searchIndex === 'bruteforce'
    ? findTopKNeighborIndicesSquared(q, store, 5)
    : findTopKNeighborIndicesBucketedSquared(q, store, 5);
  const fraud_score = fraudScoreFromNeighbors(store.labels, neighbors);
  return decisionFromFraudScore(fraud_score);
}
