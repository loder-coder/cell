(() => {
const TAU = Math.PI * 2;

const PERF_LIMITS = {
  desktop: {
    maxEnemies: 150,
    maxParticles: 520,
    maxProjectiles: 180,
    particleScale: 0.68,
    shadowScale: 0.55,
    screenEffectScale: 1,
    spatialCellSize: 220,
  },
  mobile: {
    maxEnemies: 100,
    maxParticles: 260,
    maxProjectiles: 120,
    particleScale: 0.34,
    shadowScale: 0.18,
    screenEffectScale: 0.55,
    spatialCellSize: 240,
  },
};

const ENEMY_CAP_HP_STEP = 0.05;
const ENEMY_CAP_MAX_BONUS = 3;
const BGM_PATH = "assets/audio/bgm.mp3";

const ENEMY_BEHAVIORS = {
  CHASER: "chaser",
  DASHER: "dasher",
  RANGED: "ranged",
  EXPLODER: "exploder",
  SUMMONER: "summoner",
  SUPPORT: "support",
};

globalThis.CellConstants = {
  TAU,
  PERF_LIMITS,
  ENEMY_CAP_HP_STEP,
  ENEMY_CAP_MAX_BONUS,
  BGM_PATH,
  ENEMY_BEHAVIORS,
};
})();
