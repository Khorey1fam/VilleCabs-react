// Reserved stock for store orders: put back when an order is rejected,
// cancelled or left unpaid. Reads must happen before writes in a transaction,
// so callers read the product snapshots first and then restore.
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('./common');

function restoreStock(tx, order, productSnaps) {
  Object.entries(order.stockTaken || {}).forEach(([pid, qty]) => {
    const s = productSnaps[pid];
    if (s && s.exists && qty > 0) tx.update(s.ref, { stock: FieldValue.increment(qty) });
  });
}
async function readStockProducts(tx, order) {
  const out = {};
  const ids = Object.keys(order.stockTaken || {});
  const snaps = await Promise.all(ids.map((pid) => tx.get(db().doc(`merchants/${order.merchantId}/products/${pid}`))));
  snaps.forEach((s, i) => { out[ids[i]] = s; });
  return out;
}

module.exports = { restoreStock, readStockProducts };
