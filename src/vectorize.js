/**
 * Vetorização de transação conforme docs/br/REGRAS_DE_DETECCAO.md (14 dimensões).
 */

/** @param {number} x */
export function clampOneZero(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Dia da semana no eixo da spec: segunda=0 … domingo=6 (UTC).
 * @param {Date} date
 */
export function utcDaySpec(date) {
  return (date.getUTCDay() + 6) % 7;
}

/**
 * @param {unknown} payload
 * @param {Record<string, number>} normalization
 * @param {Record<string, number>} mccRisk
 * @returns {Float32Array}
 */
export function vectorize(payload, normalization, mccRisk) {
  const {
    transaction,
    customer,
    merchant,
    terminal,
    last_transaction: lastTx,
  } = payload;

  const v = new Float32Array(14);

  const n = normalization;

  v[0] = clampOneZero(transaction.amount / n.max_amount);
  v[1] = clampOneZero(transaction.installments / n.max_installments);
  v[2] = clampOneZero(
    transaction.amount / customer.avg_amount / n.amount_vs_avg_ratio,
  );

  const requestedAt = new Date(transaction.requested_at);
  v[3] = requestedAt.getUTCHours() / 23;
  v[4] = utcDaySpec(requestedAt) / 6;

  if (lastTx == null) {
    v[5] = -1;
    v[6] = -1;
  } else {
    const lastAt = new Date(lastTx.timestamp);
    const deltaMs = requestedAt.getTime() - lastAt.getTime();
    const minutes = deltaMs / 60_000;
    v[5] = clampOneZero(minutes / n.max_minutes);
    v[6] = clampOneZero(lastTx.km_from_current / n.max_km);
  }

  v[7] = clampOneZero(terminal.km_from_home / n.max_km);
  v[8] = clampOneZero(customer.tx_count_24h / n.max_tx_count_24h);
  v[9] = terminal.is_online ? 1 : 0;
  v[10] = terminal.card_present ? 1 : 0;
  v[11] = customer.known_merchants.includes(merchant.id) ? 0 : 1;

  const mccKey = String(merchant.mcc);
  v[12] = Object.hasOwn(mccRisk, mccKey) ? mccRisk[mccKey] : 0.5;

  v[13] = clampOneZero(merchant.avg_amount / n.max_merchant_avg_amount);

  return v;
}
