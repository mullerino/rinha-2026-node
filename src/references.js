import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');

export const DIM = 14;

const BIN_AMOUNT_VS_AVG = 16;
const BIN_MINUTES = 16;
const BIN_KM_HOME = 16;
const BIN_TX_COUNT = 16;
const BIN_MCC_RISK = 8;

const SHIFT_AMOUNT_VS_AVG = 0;
const SHIFT_MINUTES = 4;
const SHIFT_KM_HOME = 9;
const SHIFT_TX_COUNT = 13;
const SHIFT_IS_ONLINE = 17;
const SHIFT_CARD_PRESENT = 18;
const SHIFT_UNKNOWN_MERCHANT = 19;
const SHIFT_MCC_RISK = 20;

function unitBin(value, bins) {
  if (value <= 0) return 0;
  if (value >= 1) return bins - 1;
  return Math.floor(value * bins);
}

function binaryBin(value) {
  return value >= 0.5 ? 1 : 0;
}

export function minutesBucketCode(value) {
  return value < 0 ? 0 : unitBin(value, BIN_MINUTES) + 1;
}

export function bucketKeyFromVectorAt(vectors, off) {
  return (
    (unitBin(vectors[off + 2], BIN_AMOUNT_VS_AVG) << SHIFT_AMOUNT_VS_AVG)
    | (minutesBucketCode(vectors[off + 5]) << SHIFT_MINUTES)
    | (unitBin(vectors[off + 7], BIN_KM_HOME) << SHIFT_KM_HOME)
    | (unitBin(vectors[off + 8], BIN_TX_COUNT) << SHIFT_TX_COUNT)
    | (binaryBin(vectors[off + 9]) << SHIFT_IS_ONLINE)
    | (binaryBin(vectors[off + 10]) << SHIFT_CARD_PRESENT)
    | (binaryBin(vectors[off + 11]) << SHIFT_UNKNOWN_MERCHANT)
    | (unitBin(vectors[off + 12], BIN_MCC_RISK) << SHIFT_MCC_RISK)
  );
}

export function bucketKeyFromVector(vector) {
  return (
    (unitBin(vector[2], BIN_AMOUNT_VS_AVG) << SHIFT_AMOUNT_VS_AVG)
    | (minutesBucketCode(vector[5]) << SHIFT_MINUTES)
    | (unitBin(vector[7], BIN_KM_HOME) << SHIFT_KM_HOME)
    | (unitBin(vector[8], BIN_TX_COUNT) << SHIFT_TX_COUNT)
    | (binaryBin(vector[9]) << SHIFT_IS_ONLINE)
    | (binaryBin(vector[10]) << SHIFT_CARD_PRESENT)
    | (binaryBin(vector[11]) << SHIFT_UNKNOWN_MERCHANT)
    | (unitBin(vector[12], BIN_MCC_RISK) << SHIFT_MCC_RISK)
  );
}

function intervalDistanceSquared(value, low, high) {
  if (value < low) {
    const diff = low - value;
    return diff * diff;
  }
  if (value > high) {
    const diff = value - high;
    return diff * diff;
  }
  return 0;
}

function unitBucketDistanceSquared(value, code, bins) {
  const low = code / bins;
  const high = (code + 1) / bins;
  return intervalDistanceSquared(value, low, high);
}

function binaryBucketDistanceSquared(value, code) {
  const diff = value - code;
  return diff * diff;
}

export function bucketLowerBoundSquared(query, key) {
  const amountCode = (key >> SHIFT_AMOUNT_VS_AVG) & 0b1111;
  const minutesCode = (key >> SHIFT_MINUTES) & 0b11111;
  const kmHomeCode = (key >> SHIFT_KM_HOME) & 0b1111;
  const txCountCode = (key >> SHIFT_TX_COUNT) & 0b1111;
  const isOnlineCode = (key >> SHIFT_IS_ONLINE) & 0b1;
  const cardPresentCode = (key >> SHIFT_CARD_PRESENT) & 0b1;
  const unknownMerchantCode = (key >> SHIFT_UNKNOWN_MERCHANT) & 0b1;
  const mccRiskCode = (key >> SHIFT_MCC_RISK) & 0b111;

  let sum = 0;
  sum += unitBucketDistanceSquared(query[2], amountCode, BIN_AMOUNT_VS_AVG);

  if (minutesCode === 0) {
    const diff = query[5] + 1;
    sum += diff * diff;
  } else {
    sum += unitBucketDistanceSquared(query[5], minutesCode - 1, BIN_MINUTES);
  }

  sum += unitBucketDistanceSquared(query[7], kmHomeCode, BIN_KM_HOME);
  sum += unitBucketDistanceSquared(query[8], txCountCode, BIN_TX_COUNT);
  sum += binaryBucketDistanceSquared(query[9], isOnlineCode);
  sum += binaryBucketDistanceSquared(query[10], cardPresentCode);
  sum += binaryBucketDistanceSquared(query[11], unknownMerchantCode);
  sum += unitBucketDistanceSquared(query[12], mccRiskCode, BIN_MCC_RISK);

  return sum;
}

/**
 * @param {{ count: number, vectors: Float32Array }} store
 */
export function buildBucketIndex(store) {
  const { count, vectors } = store;
  const counts = new Map();

  for (let i = 0; i < count; i++) {
    const key = bucketKeyFromVectorAt(vectors, i * DIM);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sortedKeys = Array.from(counts.keys()).sort((a, b) => a - b);
  const bucketCount = sortedKeys.length;
  const keys = new Uint32Array(bucketCount);
  const starts = new Uint32Array(bucketCount);
  const lengths = new Uint32Array(bucketCount);
  const indices = new Uint32Array(count);
  const cursorByKey = new Map();

  let start = 0;
  for (let b = 0; b < bucketCount; b++) {
    const key = sortedKeys[b];
    const length = counts.get(key);
    keys[b] = key;
    starts[b] = start;
    lengths[b] = length;
    cursorByKey.set(key, start);
    start += length;
  }

  for (let i = 0; i < count; i++) {
    const key = bucketKeyFromVectorAt(vectors, i * DIM);
    const cursor = cursorByKey.get(key);
    indices[cursor] = i;
    cursorByKey.set(key, cursor + 1);
  }

  return { keys, starts, lengths, indices };
}

/**
 * @param {Float32Array} vectors
 * @param {Uint8Array} labels
 * @returns {{ count: number, dim: number, vectors: Float32Array, labels: Uint8Array }}
 */
export function buildReferenceStore(vectors, labels) {
  const count = labels.length;

  if (vectors.length !== count * DIM) {
    throw new Error(`vectors length ${vectors.length} !== ${count * DIM}`);
  }

  const store = { count, dim: DIM, vectors, labels };
  store.bucketIndex = buildBucketIndex(store);
  return store;
}

export function loadReferencesFromBinaryFiles() {
  const vectorsBuffer = readFileSync(join(dataDir, 'vectors.bin'));

  const vectors = new Float32Array(
    vectorsBuffer.buffer,
    vectorsBuffer.byteOffset,
    vectorsBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  
  const labels = readFileSync(join(dataDir, 'labels.bin'));
  const store = buildReferenceStore(vectors, labels);
  return store;
}
