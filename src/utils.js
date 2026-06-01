(() => {
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function isOutsideRect(entity, rect, margin = 0) {
  return entity.x < rect.left - margin || entity.x > rect.right + margin || entity.y < rect.top - margin || entity.y > rect.bottom + margin;
}

globalThis.CellUtils = {
  rand,
  clamp,
  dist2,
  angleDelta,
  isOutsideRect,
};
})();
