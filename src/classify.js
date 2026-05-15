import { findTopKNeighborIndicesSquared, fraudScoreFromNeighbors, decisionFromFraudScore } from './knn.js';
import { vectorize } from './vectorize.js';

/**
 * Classificação k-NN (k=5) + regra oficial de aprovação.
 * @param {unknown} payload
 * @param {Record<string, number>} normalization
 * @param {Record<string, number>} mccRisk
 * @param {{ count: number, dim: number, vectors: Float64Array, labels: Uint8Array }} store
 * @returns {{ approved: boolean, fraud_score: number }}
 */
export function classify(payload, normalization, mccRisk, store) {
  const q = vectorize(payload, normalization, mccRisk);
  const neighbors = findTopKNeighborIndicesSquared(q, store, 5);
  const fraud_score = fraudScoreFromNeighbors(store.labels, neighbors);
  return decisionFromFraudScore(fraud_score);
}
