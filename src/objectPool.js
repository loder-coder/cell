(() => {
function acquire(pool) {
  return pool.pop() || {};
}

function release(pool, object, reset) {
  if (!object) return;
  if (reset) reset(object);
  pool.push(object);
}

globalThis.CellObjectPool = {
  acquire,
  release,
};
})();
