(() => {
const { PERF_LIMITS } = globalThis.CellConstants;

function createRuntimeConfig() {
  const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const narrowScreen = Math.min(window.innerWidth || 1024, window.innerHeight || 768) <= 760;
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
  const mobile = coarsePointer || narrowScreen || lowMemory;
  return {
    mobile,
    quality: mobile ? PERF_LIMITS.mobile : PERF_LIMITS.desktop,
  };
}

globalThis.CellPlatform = {
  createRuntimeConfig,
};
})();
