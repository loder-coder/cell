(() => {
function readMemoryUsage() {
  const memory = performance.memory;
  if (!memory) return "n/a";
  return `${Math.round(memory.usedJSHeapSize / 1048576)} MB`;
}

function activeMutationCount(player) {
  return player.tentacles + player.acid + player.electric + player.spores + player.eyes + player.shell + player.splitting + player.absorption + player.slime + player.dash + player.accelStack;
}

globalThis.CellDebug = {
  readMemoryUsage,
  activeMutationCount,
};
})();
