(() => {
function isEffectParticle(particle) {
  return particle.kind !== "splash" && particle.kind !== "text" && particle.kind !== "absorb";
}

function countEffects(particles) {
  let total = 0;
  for (const particle of particles) {
    if (isEffectParticle(particle)) total++;
  }
  return total;
}

function resetParticle(particle) {
  if (particle.hitTargets) particle.hitTargets.clear();
  particle.text = "";
  particle.x2 = 0;
  particle.y2 = 0;
  particle.maxRadius = 0;
  particle.damage = 0;
}

globalThis.CellParticleSystem = {
  countEffects,
  resetParticle,
};
})();
