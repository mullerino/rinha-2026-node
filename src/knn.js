import { DIM } from './references.js';

/**
 * Distância euclidiana ao quadrado entre query e o i-ésimo vetor plano.
 * @param {Float32Array} query - length DIM
 * @param {Float32Array} vectors
 * @param {number} dim
 */
export function squaredDistanceAt(query, vectors, index, dim = DIM) {
  const off = index * dim;
  let sum = 0;
  for (let d = 0; d < dim; d++) {
    const diff = query[d] - vectors[off + d];
    sum += diff * diff;
  }
  return sum;
}

/**
 * k vizinhos com menor distância; empates: menor índice do ponto na base.
 * Mantém no máximo k+1 candidatos e ordena a cada iteração (k pequeno).
 * @param {Float64Array} query
 * @param {{ count: number, dim: number, vectors: Float64Array, labels: Uint8Array }} store
 * @param {number} k
 * @returns {number[]} índices dos k vizinhos (ordem por distância crescente, depois índice)
 */
export function findTopKNeighborIndicesSquared(query, store, k = 5) {
  const { vectors, count, dim } = store;
  const top = [];

  const cmp = (a, b) => (a.sq !== b.sq ? a.sq - b.sq : a.i - b.i);

  for (let i = 0; i < count; i++) {
    const sq = squaredDistanceAt(query, vectors, i, dim);
    top.push({ sq, i });
    top.sort(cmp);
    if (top.length > k) top.length = k;
  }

  return top.map((t) => t.i);
}

/**
 * @param {Uint8Array} labels
 * @param {number[]} neighborIndices
 */
export function fraudScoreFromNeighbors(labels, neighborIndices) {
  let fraudVotes = 0;
  for (const idx of neighborIndices) {
    if (labels[idx] === 1) fraudVotes++;
  }
  return fraudVotes / neighborIndices.length;
}

/**
 * @param {number} fraudScore
 */
export function decisionFromFraudScore(fraudScore) {
  return {
    fraud_score: fraudScore,
    approved: fraudScore < 0.6,
  };
}
