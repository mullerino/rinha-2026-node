import { bucketKeyFromVector, bucketLowerBoundSquared } from './references.js';

/**
 * Distância euclidiana ao quadrado entre query e o i-ésimo vetor plano.
 * @param {Float32Array} query - length DIM
 * @param {Float32Array} vectors
 * @param {number} index
 */
export function squaredDistanceAt(query, vectors, index) {
  const off = index * 14;
  const q = query;
  const v = vectors;

  let sum = 0;
  for (let d = 0; d < 14; d++) {
    const diff = q[d] - v[off + d];
    sum += diff * diff;
  }
  return sum;
}

/**
 * k vizinhos com menor distância; empates: menor índice do ponto na base.
 * Mantém no máximo k+1 candidatos e ordena a cada iteração (k pequeno).
 * @param {Float32Array} query
 * @param {{ count: number, vectors: Float32Array, labels: Uint8Array }} store
 * @param {number} k
 * @returns {Uint32Array} índices dos k vizinhos (ordem por distância crescente, depois índice)
 */
export function findTopKNeighborIndicesSquared(query, store, k = 5) {
  const { vectors, count } = store;

  const bestSq = new Array(k);
  const bestIdx = new Uint32Array(k);

  bestSq.fill(Infinity);
  bestIdx.fill(0xffffffff);

  for (let i = 0; i < count; i++) {
    const sq = squaredDistanceAt(query, vectors, i);

    if (sq > bestSq[k - 1] || (sq === bestSq[k - 1] && i >= bestIdx[k - 1])) {
      continue;
    }

    let pos = k - 1;

    while (
      pos > 0
      && (sq < bestSq[pos - 1] || (sq === bestSq[pos - 1] && i < bestIdx[pos - 1]))
    ) {
      bestSq[pos] = bestSq[pos - 1];
      bestIdx[pos] = bestIdx[pos - 1];
      pos--;
    }

    bestSq[pos] = sq;
    bestIdx[pos] = i;
  }

  return bestIdx;
}

function insertTopK(bestSq, bestIdx, k, sq, idx) {
  if (sq > bestSq[k - 1] || (sq === bestSq[k - 1] && idx >= bestIdx[k - 1])) {
    return;
  }

  let pos = k - 1;
  while (
    pos > 0
    && (sq < bestSq[pos - 1] || (sq === bestSq[pos - 1] && idx < bestIdx[pos - 1]))
  ) {
    bestSq[pos] = bestSq[pos - 1];
    bestIdx[pos] = bestIdx[pos - 1];
    pos--;
  }

  bestSq[pos] = sq;
  bestIdx[pos] = idx;
}

function findBucketPosition(keys, key) {
  let lo = 0;
  let hi = keys.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midKey = keys[mid];
    if (midKey === key) return mid;
    if (midKey < key) lo = mid + 1;
    else hi = mid - 1;
  }

  return -1;
}

function scanBucketRange(query, vectors, bucketIndices, start, length, bestSq, bestIdx, k, stats) {
  const t0 = stats ? performance.now() : 0;
  const end = start + length;

  for (let p = start; p < end; p++) {
    const idx = bucketIndices[p];
    const sq = squaredDistanceAt(query, vectors, idx);
    insertTopK(bestSq, bestIdx, k, sq, idx);
  }

  if (stats) {
    stats.candidatesScanned += length;
    stats.distanceMs += performance.now() - t0;
  }
}

/**
 * Busca top-k exata usando buckets apenas para pular regiões cujo lower bound
 * prova que não podem conter um vizinho melhor.
 *
 * @param {Float32Array} query
 * @param {{ count: number, vectors: Float32Array, bucketIndex?: { keys: Uint32Array, starts: Uint32Array, lengths: Uint32Array, indices: Uint32Array } }} store
 * @param {number} k
 * @param {{ bucketsVisited?: number, bucketsSkipped?: number, candidatesScanned?: number, lowerBoundMs?: number, distanceMs?: number }} [stats]
 * @returns {Uint32Array}
 */
export function findTopKNeighborIndicesBucketedSquared(query, store, k = 5, stats) {
  const { vectors, bucketIndex } = store;
  if (!bucketIndex || !bucketIndex.keys || !bucketIndex.starts || !bucketIndex.lengths || !bucketIndex.indices) {
    return findTopKNeighborIndicesSquared(query, store, k);
  }

  if (stats) {
    stats.bucketsVisited = 0;
    stats.bucketsSkipped = 0;
    stats.candidatesScanned = 0;
    stats.lowerBoundMs = 0;
    stats.distanceMs = 0;
  }

  const bestSq = new Array(k);
  const bestIdx = new Uint32Array(k);
  bestSq.fill(Infinity);
  bestIdx.fill(0xffffffff);

  const queryKey = bucketKeyFromVector(query);
  const exactBucketPos = findBucketPosition(bucketIndex.keys, queryKey);

  if (exactBucketPos >= 0) {
    if (stats) stats.bucketsVisited++;
    scanBucketRange(
      query,
      vectors,
      bucketIndex.indices,
      bucketIndex.starts[exactBucketPos],
      bucketIndex.lengths[exactBucketPos],
      bestSq,
      bestIdx,
      k,
      stats,
    );
  }

  for (let b = 0; b < bucketIndex.keys.length; b++) {
    if (b === exactBucketPos) continue;

    const lbStart = stats ? performance.now() : 0;
    const lowerBound = bucketLowerBoundSquared(query, bucketIndex.keys[b]);
    if (stats) stats.lowerBoundMs += performance.now() - lbStart;

    if (lowerBound > bestSq[k - 1]) {
      if (stats) stats.bucketsSkipped++;
      continue;
    }

    if (stats) stats.bucketsVisited++;
    scanBucketRange(
      query,
      vectors,
      bucketIndex.indices,
      bucketIndex.starts[b],
      bucketIndex.lengths[b],
      bestSq,
      bestIdx,
      k,
      stats,
    );
  }

  return bestIdx;
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
