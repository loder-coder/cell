(() => {
const TAU = Math.PI * 2;

const PERF_LIMITS = {
  desktop: {
    maxEnemies: 150,
    maxParticles: 900,
    maxProjectiles: 260,
    particleScale: 1,
    shadowScale: 1,
    screenEffectScale: 1,
    spatialCellSize: 220,
  },
  mobile: {
    maxEnemies: 100,
    maxParticles: 420,
    maxProjectiles: 170,
    particleScale: 0.48,
    shadowScale: 0.35,
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
