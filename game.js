(() => {
  const { BGM_PATH, ENEMY_BEHAVIORS, ENEMY_CAP_HP_STEP, ENEMY_CAP_MAX_BONUS, TAU } = globalThis.CellConstants;
  const { angleDelta, clamp, dist2, isOutsideRect, rand } = globalThis.CellUtils;
  const { createRuntimeConfig } = globalThis.CellPlatform;
  const { SpatialHash } = globalThis.CellSpatial;
  const { acquire, release } = globalThis.CellObjectPool;
  const { countEffects, resetParticle } = globalThis.CellParticleSystem;
  const { applyEnemyBehavior } = globalThis.CellEnemyBehaviors;
  const { activeMutationCount, readMemoryUsage } = globalThis.CellDebug;
  const { applyMutationLabel } = globalThis.CellMutationRegistry;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hpBar = document.getElementById("hpBar");
  const xpBar = document.getElementById("xpBar");
  const levelText = document.getElementById("levelText");
  const timeText = document.getElementById("timeText");
  const statPanel = document.getElementById("statPanel");
  const startPanel = document.getElementById("startPanel");
  const startButton = document.getElementById("startButton");
  const pausePanel = document.getElementById("pausePanel");
  const resumeButton = document.getElementById("resumeButton");
  const mutationPanel = document.getElementById("mutationPanel");
  const choiceGrid = document.getElementById("choiceGrid");
  const mutationTitle = document.getElementById("mutationTitle");
  const gameOverPanel = document.getElementById("gameOverPanel");
  const restartButton = document.getElementById("restartButton");
  const overStats = document.getElementById("overStats");
  const overTitle = document.getElementById("overTitle");
  const painFlash = document.getElementById("painFlash");
  const evolutionBanner = document.getElementById("evolutionBanner");
  const evolutionText = document.getElementById("evolutionText");

  const runtimeConfig = createRuntimeConfig();
  const quality = runtimeConfig.quality;
  const MAX_ENEMIES = quality.maxEnemies;
  const MAX_PARTICLES = quality.maxParticles;
  const MAX_PROJECTILES = quality.maxProjectiles;
  const enemyGrid = new SpatialHash(quality.spatialCellSize);

  let width = 0;
  let height = 0;
  let dpr = 1;
  let last = 0;
  let state = "start";
  let shake = 0;
  let pulse = 0;
  let runTime = 0;
  let spawnTimer = 0;
  let bossTimer = 38;
  let mobilePointer = null;
  let choices = [];
  let audio = null;
  let bgm = null;
  let hitStop = 0;
  let playerHurt = 0;
  let screenPulse = 0;
  let lastContactHit = 0;
  let bannerTimer = 0;
  let finalPhase = false;
  let finalBossSpawned = false;
  let enemyCapBonus = 0;
  let lastStatsSignature = "";

  const keys = new Set();
  const enemies = [];
  const particles = [];
  const projectiles = [];
  const perf = {
    fps: 60,
    drawCalls: 0,
    spatialCandidates: 0,
  };
  const scratchEnemies = [];
  const cullRect = { left: 0, right: 0, top: 0, bottom: 0 };
  const viewRect = { left: 0, right: 0, top: 0, bottom: 0 };
  const enemyProjectileHit = { kind: "phage", x: 0, y: 0 };
  const pools = { enemies: [], particles: [], projectiles: [] };
  const perfGuard = {
    effectScale: 1,
    trailLimit: 9,
    hpBarStride: 1,
    textCooldown: 0,
  };
  const balance = {
    window: 5,
    damageTotal: 0,
    healTotal: 0,
    bucketStep: 0.5,
    bucketCursor: -1,
    damageBuckets: new Array(10).fill(0),
    healBuckets: new Array(10).fill(0),
    playerDps: 0,
    playerHps: 0,
    avgEnemyHp: 0,
    avgEnemyDamage: 0,
    avgTtk: 0,
    wave: 1,
  };
  const session = {
    tutorialMarks: [5, 10, 15],
    tutorialIndex: 0,
    finalPhaseAt: 900,
    nextWaveAt: 180,
    waveIndex: 0,
  };
  const camera = {
    x: 0,
    y: 0,
    scale: 1,
    targetScale: 1,
    worldWidth: 0,
    worldHeight: 0,
  };

  const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 22,
    hp: 100,
    maxHp: 100,
    xp: 0,
    nextXp: 16,
    level: 1,
    kills: 0,
    speed: 260,
    acceleration: 10,
    accelStack: 0,
    armor: 0,
    regen: 0,
    absorption: 0,
    attackSpeed: 1,
    bite: 1,
    tentacles: 0,
    acid: 0,
    electric: 0,
    spores: 0,
    eyes: 0,
    shell: 0,
    splitting: 0,
    dash: 0,
    slime: 0,
    evolution: "",
    evolutionName: "",
    mutationPulse: 0,
    cooldowns: {
      bite: 0,
      lash: 0,
      acid: 0,
      spark: 0,
      spore: 0,
      split: 0,
      shell: 0,
      dash: 0,
      toxin: 0,
    },
    trail: [],
  };
  const cooldownKeys = Object.keys(player.cooldowns);

  const MAX_STACK = 5;
  const EVOLUTION_STACK = 4;
  const evolutionDefs = [
    { id: "electricTentacles", name: "전기 촉수 군체", needs: ["tentacles", "electric"], hint: "촉수 + 감전" },
    { id: "toxicHive", name: "독성 군락체", needs: ["acid", "spores"], hint: "산성 + 포자" },
    { id: "immortalMass", name: "불멸 생체질량", needs: ["regen", "shell"], hint: "재생 + 외골격" },
    { id: "swarmOrganism", name: "분열 포식군", needs: ["splitting", "absorption"], hint: "분열 + 흡수" },
  ];

  const mutations = [
    { id: "tentacles", name: "촉수 증식", type: "공격 장기", tag: "촉수 +1, 근접 자동공격", desc: "살덩이에서 붙잡는 촉수가 자라 근처 먹이를 후려친다.", path: "감전 기관과 결합하면 전기 촉수 군체", apply: () => player.tentacles = Math.min(MAX_STACK, player.tentacles + 1) },
    { id: "acid", name: "산성 주머니", type: "공격 장기", tag: "산성탄 +1, 원거리 공격", desc: "부식성 체액을 뱉는 낭이 부풀어 적을 녹인다.", path: "포자낭과 결합하면 독성 군락체", apply: () => player.acid = Math.min(MAX_STACK, player.acid + 1) },
    { id: "electric", name: "감전 기관", type: "공격 장기", tag: "전기 연쇄 +1, 범위 피해", desc: "노출된 신경 다발이 주변 생체를 태우는 전류를 방출한다.", path: "촉수와 결합하면 전기 촉수 군체", apply: () => player.electric = Math.min(MAX_STACK, player.electric + 1) },
    { id: "spores", name: "산성 포자낭", type: "공격 장기", tag: "포자 +1, 사방 발사", desc: "맥동하는 혹에서 기생 포자가 흘러나와 사방으로 번진다.", path: "산성 주머니와 결합하면 독성 군락체", apply: () => player.spores = Math.min(MAX_STACK, player.spores + 1) },
    { id: "eyes", name: "다중 안구", type: "감각 장기", tag: "공격 속도 +14%", desc: "눈이 더 열린다. 먹이를 더 빨리 찾고 더 자주 공격한다.", path: "모든 공격 변이를 선명하게 보조", apply: () => { player.eyes = Math.min(MAX_STACK, player.eyes + 1); player.attackSpeed += 0.14; } },
    { id: "regen", name: "재생 육질", type: "방어 장기", tag: "초당 회복 +1, 최대 체력 +8", desc: "찢긴 살이 스스로 기어 붙어 상처를 메운다.", path: "외골격과 결합하면 불멸 생체질량", apply: () => { player.regen = Math.min(MAX_STACK, player.regen + 1); player.maxHp += 8; player.hp += 8; } },
    { id: "shell", name: "외골격 형성", type: "방어 장기", tag: "피해 감소 +7%, 최대 체력 +12", desc: "뼈 같은 판이 살갗을 뚫고 올라와 충격을 분산한다.", path: "재생 육질과 결합하면 불멸 생체질량", apply: () => { player.shell = Math.min(MAX_STACK, player.shell + 1); player.armor += 0.07; player.maxHp += 12; player.hp += 12; } },
    { id: "splitting", name: "분열 세포", type: "방어 장기", tag: "분열 공격 +1", desc: "작은 살점들이 떨어져 나와 추격자를 물어뜯는다.", path: "흡수구와 결합하면 분열 포식군", apply: () => player.splitting = Math.min(MAX_STACK, player.splitting + 1) },
    { id: "absorption", name: "흡수구 개방", type: "방어 장기", tag: "흡수 회복 +2.5, XP +8%", desc: "새로운 입이 열려 죽은 조직의 열과 질량을 빨아들인다.", path: "분열 세포와 결합하면 분열 포식군", apply: () => player.absorption = Math.min(MAX_STACK, player.absorption + 1) },
    { id: "dash", name: "경련성 돌진", type: "이동 변이", tag: "자동 돌진 +1, 쿨다운 감소", desc: "근육이 비정상적으로 수축해 젖은 잔상을 남기며 튄다.", path: "이동 생존력 강화", apply: () => player.dash = Math.min(MAX_STACK, player.dash + 1) },
    { id: "slime", name: "점액 흔적", type: "이동 변이", tag: "장판 둔화 + 피해", desc: "뒤틀린 점액이 바닥에 남아 추격자를 늦추고 녹인다.", path: "후반 압박을 늦추는 오염 지대", apply: () => player.slime = Math.min(MAX_STACK, player.slime + 1) },
    { id: "acceleration", name: "경련 근섬유", type: "이동 변이", tag: "이동 속도 +22, 가속 +1.8", desc: "움직임이 인간적인 방향성을 잃고 더 갑작스러워진다.", path: "기동성 강화", apply: () => { player.accelStack = Math.min(MAX_STACK, player.accelStack + 1); player.acceleration += 1.8; player.speed += 22; } },
  ];

  const evolutionLabels = {
    electricTentacles: { name: "전기 촉수 군체", hint: "촉수 + 감전" },
    toxicHive: { name: "산성 포자 군체", hint: "산성 + 포자" },
    immortalMass: { name: "불멸 생체질량", hint: "재생 + 껍질" },
    swarmOrganism: { name: "분열 사식군", hint: "분열 + 흡수" },
  };

  const mutationLabels = {
    tentacles: {
      name: "촉수 증식",
      type: "공격 변이",
      tag: "촉수 +1, 근접 자동공격",
      desc: "등 뒤에서 붉은 촉수가 자라 근처 먹이를 휘감습니다.",
      path: "감전 기관과 결합하면 전기 촉수 군체",
    },
    acid: {
      name: "산성 주머니",
      type: "공격 변이",
      tag: "산성액 +1, 원거리 공격",
      desc: "부식성 체액을 뱉어 멀리 있는 적을 녹입니다.",
      path: "포자낭과 결합하면 산성 포자 군체",
    },
    electric: {
      name: "감전 기관",
      type: "공격 변이",
      tag: "전기 연쇄 +1, 범위 피해",
      desc: "노출된 신경 다발이 주변 생체를 태우는 전류를 방출합니다.",
      path: "촉수와 결합하면 전기 촉수 군체",
    },
    spores: {
      name: "산성 포자낭",
      type: "공격 변이",
      tag: "포자 +1, 산탄 발사",
      desc: "맥동하는 낭에서 기생 포자가 흘러나와 사방으로 번집니다.",
      path: "산성 주머니와 결합하면 산성 포자 군체",
    },
    eyes: {
      name: "다중 안구",
      type: "감각 변이",
      tag: "공격 속도 +14%",
      desc: "여러 눈이 먹이를 더 빨리 찾아내고 더 자주 공격합니다.",
      path: "모든 공격 변이를 선명하게 보조",
    },
    regen: {
      name: "재생 점막",
      type: "방어 변이",
      tag: "초당 회복 +1, 최대 체력 +8",
      desc: "찢긴 살이 스스로 기어 붙어 상처를 메웁니다.",
      path: "껍질 형성과 결합하면 불멸 생체질량",
    },
    shell: {
      name: "껍질 형성",
      type: "방어 변이",
      tag: "피해 감소 +7%, 최대 체력 +12",
      desc: "뼈 같은 막이 두껍게 닫히며 충격을 분산합니다.",
      path: "재생 점막과 결합하면 불멸 생체질량",
    },
    splitting: {
      name: "분열 세포",
      type: "방어 변이",
      tag: "분열 공격 +1",
      desc: "작은 세포들이 떨어져 나가 추격자를 물어뜯습니다.",
      path: "흡수구 개방과 결합하면 분열 사식군",
    },
    absorption: {
      name: "흡수구 개방",
      type: "방어 변이",
      tag: "흡수 회복 +2.5, XP +8%",
      desc: "새로운 입이 열려 죽은 조직의 피와 질량을 빨아들입니다.",
      path: "분열 세포와 결합하면 분열 사식군",
    },
    dash: {
      name: "경련성 돌진",
      type: "이동 변이",
      tag: "자동 돌진 +1, 쿨다운 감소",
      desc: "근육이 비정상적으로 수축해 위기 순간 몸을 튕겨냅니다.",
      path: "이동 생존력 강화",
    },
    slime: {
      name: "점액 흔적",
      type: "이동 변이",
      tag: "늪판 둔화 + 피해",
      desc: "끈적한 점액이 바닥에 남아 추격자를 늦추고 녹입니다.",
      path: "전장 장악과 추격 저지",
    },
    acceleration: {
      name: "경련 근섬유",
      type: "이동 변이",
      tag: "이동 속도 +22, 가속 +1.8",
      desc: "움직임이 순간적인 방향성을 얻고 갑작스럽게 돌진합니다.",
      path: "기동력 강화",
    },
  };

  evolutionDefs.forEach((evo) => Object.assign(evo, evolutionLabels[evo.id]));
  mutations.forEach((mutation) => applyMutationLabel(mutation, mutationLabels));

  const enemyTypes = {
    cell: { hp: 10, speed: 64, radius: 12, damage: 7, xp: 2, color: "#d12d55", behavior: ENEMY_BEHAVIORS.CHASER },
    parasite: { hp: 7, speed: 128, radius: 8, damage: 5, xp: 2, color: "#8fffd3", behavior: ENEMY_BEHAVIORS.DASHER },
    toxic: { hp: 16, speed: 50, radius: 14, damage: 11, xp: 4, color: "#b6ff4b", behavior: ENEMY_BEHAVIORS.CHASER },
    splitter: { hp: 22, speed: 48, radius: 16, damage: 9, xp: 5, color: "#ff7b3f", behavior: ENEMY_BEHAVIORS.CHASER },
    giant: { hp: 112, speed: 34, radius: 34, damage: 18, xp: 20, color: "#ff245c", behavior: ENEMY_BEHAVIORS.CHASER },
    tutorial: { hp: 18, speed: 36, radius: 15, damage: 0, xp: 7, color: "#d4fff0", behavior: ENEMY_BEHAVIORS.CHASER },
    phage: { hp: 6200, speed: 28, radius: 86, damage: 42, xp: 420, color: "#d8f0ff", behavior: ENEMY_BEHAVIORS.RANGED },
  };

  function playerScaleFactor() {
    return clamp(player.radius / 22, 1, 2.45);
  }

  function enemyProgressScale() {
    return 1 + runTime / 390 + Math.max(0, runTime - 240) / 620 + Math.max(0, runTime - 720) / 1200;
  }

  function enemyCapDifficultyScale() {
    return 1 + enemyCapBonus;
  }

  function enemyCapDamageScale() {
    return 1 + enemyCapBonus * 0.72;
  }

  function enemyCapSpeedScale() {
    return 1 + enemyCapBonus * 0.14;
  }

  function addEnemyCapPressure(strength = 1) {
    if (finalPhase) return;
    enemyCapBonus = clamp(enemyCapBonus + ENEMY_CAP_HP_STEP * strength, 0, ENEMY_CAP_MAX_BONUS);
  }

  function xpMultiplier() {
    return 1 + player.absorption * 0.08 + Math.min(1.2, Math.floor(runTime / 180) * 0.12);
  }

  function updatePerformanceGuard(dt) {
    perfGuard.textCooldown = Math.max(0, perfGuard.textCooldown - dt);
    const timePressure = clamp((runTime - 480) / 360, 0, 1);
    const fpsPressure = clamp((55 - perf.fps) / 18, 0, 1);
    const objectPressure = Math.max(particles.length / MAX_PARTICLES, projectiles.length / MAX_PROJECTILES);
    const pressure = clamp(Math.max(timePressure * 0.55, fpsPressure, objectPressure - 0.72), 0, 1);
    perfGuard.effectScale = clamp(1 - pressure * 0.72, runtimeConfig.mobile ? 0.22 : 0.32, 1);
    perfGuard.trailLimit = Math.max(2, Math.round(9 - pressure * 6));
    perfGuard.hpBarStride = pressure > 0.65 ? 4 : pressure > 0.35 ? 3 : enemies.length > 110 ? 2 : 1;
  }

  function enemySizeScale(kind) {
    if (kind === "tutorial") return clamp(playerScaleFactor() * 0.92, 1, 1.8);
    if (kind === "phage") return clamp(playerScaleFactor() * 1.12, 1, 2.2);
    return clamp(0.78 + playerScaleFactor() * 0.38 + runTime / 1600, 1, 2.15);
  }

  function updateCamera(dt = 1) {
    camera.targetScale = clamp(1 / (1 + Math.max(0, player.radius - 22) / 92), 0.56, 1);
    camera.scale += (camera.targetScale - camera.scale) * clamp(dt * 2.8, 0, 1);
    camera.worldWidth = width / camera.scale;
    camera.worldHeight = height / camera.scale;
    camera.x += (player.x - camera.x) * clamp(dt * 2.6, 0, 1);
    camera.y += (player.y - camera.y) * clamp(dt * 2.6, 0, 1);
  }

  function bioRange() {
    const evolved = player.evolution === "electricTentacles";
    return 130 + Math.max(player.tentacles, player.electric) * 32 + (evolved ? 110 : 0);
  }

  function tentacleRange() {
    return bioRange();
  }

  function electricRange() {
    return bioRange();
  }

  function screenToWorld(x, y) {
    return {
      x: camera.x + (x - width / 2) / camera.scale,
      y: camera.y + (y - height / 2) / camera.scale,
    };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.x = player.x || width / 2;
    player.y = player.y || height / 2;
    camera.x = camera.x || player.x;
    camera.y = camera.y || player.y;
    updateCamera(1);
  }

  function reset() {
    Object.assign(player, {
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      radius: 22,
      hp: 100,
      maxHp: 100,
      xp: 0,
      nextXp: 16,
      level: 1,
      kills: 0,
      speed: 260,
      acceleration: 10,
      accelStack: 0,
      armor: 0,
      regen: 0,
      absorption: 0,
      attackSpeed: 1,
      bite: 1,
      tentacles: 0,
      acid: 0,
      electric: 0,
      spores: 0,
      eyes: 0,
      shell: 0,
      splitting: 0,
      dash: 0,
      slime: 0,
      evolution: "",
      evolutionName: "",
      mutationPulse: 0,
      cooldowns: { bite: 0, lash: 0, acid: 0, spark: 0, spore: 0, split: 0, shell: 0, dash: 0, toxin: 0 },
      trail: [],
    });
    enemies.length = 0;
    particles.length = 0;
    projectiles.length = 0;
    runTime = 0;
    spawnTimer = 0;
    bossTimer = 68;
    finalPhase = false;
    finalBossSpawned = false;
    enemyCapBonus = 0;
    lastStatsSignature = "";
    balance.damageTotal = 0;
    balance.healTotal = 0;
    balance.bucketCursor = -1;
    balance.damageBuckets.fill(0);
    balance.healBuckets.fill(0);
    balance.playerDps = 0;
    balance.playerHps = 0;
    balance.avgEnemyHp = 0;
    balance.avgEnemyDamage = 0;
    balance.avgTtk = 0;
    balance.wave = 1;
    session.tutorialIndex = 0;
    session.nextWaveAt = 180;
    session.waveIndex = 0;
    camera.x = player.x;
    camera.y = player.y;
    camera.scale = 1;
    camera.targetScale = 1;
    shake = 0;
    hitStop = 0;
    playerHurt = 0;
    screenPulse = 0;
    lastContactHit = 0;
    bannerTimer = 0;
    evolutionBanner.classList.add("hidden");
    pausePanel.classList.add("hidden");
  }

  function startRun() {
    initAudio();
    reset();
    state = "play";
    startPanel.classList.add("hidden");
    gameOverPanel.classList.add("hidden");
    pausePanel.classList.add("hidden");
    mutationPanel.classList.add("hidden");
    for (let i = 0; i < 7; i++) spawnEnemy("cell");
  }

  function getEnemy() {
    return acquire(pools.enemies);
  }

  function freeEnemy(enemy) {
    release(pools.enemies, enemy);
  }

  function getParticle() {
    if (particles.length >= MAX_PARTICLES) {
      return null;
    }
    return acquire(pools.particles);
  }

  function getProjectile() {
    if (projectiles.length >= MAX_PROJECTILES) {
      return null;
    }
    return acquire(pools.projectiles);
  }

  function recycleParticleAt(index) {
    const p = particles.splice(index, 1)[0];
    if (!p) return;
    release(pools.particles, p, resetParticle);
  }

  function recycleProjectileAt(index) {
    const p = projectiles.splice(index, 1)[0];
    if (!p) return;
    if (p.hitTargets) p.hitTargets.clear();
    release(pools.projectiles, p);
  }

  function spawnEnemy(kind) {
    const type = enemyTypes[kind];
    if (!type) return;
    if (enemies.length >= MAX_ENEMIES) {
      addEnemyCapPressure(kind === "giant" ? 0.5 : kind === "phage" ? 1 : 0.14);
      return false;
    }
    const angle = rand(0, TAU);
    const distance = Math.max(camera.worldWidth || width, camera.worldHeight || height) * 0.58 + rand(30, 120);
    const progressScale = enemyProgressScale();
    const sizeScale = enemySizeScale(kind);
    const hpScale = (kind === "tutorial" ? 1 : kind === "phage" ? 1 + runTime / 300 : progressScale) * enemyCapDifficultyScale();
    const damageScale = (kind === "tutorial" ? 0 : kind === "phage" ? 1 + runTime / 720 : 1 + runTime / 680) * enemyCapDamageScale();
    const enemy = getEnemy();
    enemy.kind = kind;
    enemy.x = player.x + Math.cos(angle) * distance;
    enemy.y = player.y + Math.sin(angle) * distance;
    if (kind === "phage") {
      enemy.x = player.x + Math.cos(angle) * Math.min(distance, Math.max(width, height) * 0.34);
      enemy.y = player.y + Math.sin(angle) * Math.min(distance, Math.max(width, height) * 0.34);
    }
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.components = {
      stats: { baseHp: type.hp, baseDamage: type.damage, baseSpeed: type.speed, progressScale, sizeScale },
      render: { flash: 0, hpBar: true },
      collision: { attackImmune: kind === "tutorial", contactBreak: kind === "tutorial" },
      movement: { lockTimer: 0, targetX: player.x, targetY: player.y },
      boss: kind === "phage" ? { attackTimer: 2.4, waveTimer: 7.2 } : null,
    };
    enemy.hp = type.hp * hpScale * (kind === "phage" ? 1 : 1.18);
    enemy.maxHp = enemy.hp;
    enemy.speed = type.speed * (1.08 + runTime / 620) * enemyCapSpeedScale();
    enemy.baseRadius = type.radius;
    enemy.baseDamage = type.damage;
    enemy.behavior = type.behavior || ENEMY_BEHAVIORS.CHASER;
    enemy.radius = type.radius * sizeScale;
    enemy.damage = type.damage * damageScale;
    enemy.xp = type.xp;
    enemy.color = type.color;
    enemy.hit = 0;
    enemy.pulse = 0;
    enemy.splitDone = false;
    enemies.push(enemy);
    return true;
  }

  function spawnParticle(x, y, color, count, force = 1, life = 0.8) {
    const scaledCount = Math.max(1, Math.floor(count * quality.particleScale * perfGuard.effectScale));
    for (let i = 0; i < scaledCount; i++) {
      const p = getParticle();
      if (!p) return;
      const a = rand(0, TAU);
      const s = rand(30, 260) * force;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = rand(life * 0.45, life);
      p.maxLife = p.life;
      p.radius = rand(1.5, 5.5) * force;
      p.color = color;
      p.kind = "splash";
      p.text = "";
      p.hitTargets = null;
      particles.push(p);
    }
  }

  function spawnText(x, y, text, color = "#ffe5ea") {
    if (perfGuard.textCooldown > 0 || particles.length >= MAX_PARTICLES * 0.92) return;
    perfGuard.textCooldown = perf.fps < 52 ? 0.16 : 0.07;
    const p = getParticle();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = rand(-18, 18);
    p.vy = rand(-96, -58);
    p.life = 0.72;
    p.maxLife = 0.72;
    p.radius = 0;
    p.color = color;
    p.text = text;
    p.kind = "text";
    p.hitTargets = null;
    particles.push(p);
  }

  function spawnElectricArc(x1, y1, x2, y2, color = "#8fffd3") {
    if (perfGuard.effectScale < 0.55 && Math.random() < 0.45) return;
    const p = getParticle();
    if (!p) return;
    p.x = x1;
    p.y = y1;
    p.x2 = x2;
    p.y2 = y2;
    p.vx = 0;
    p.vy = 0;
    p.life = 0.16;
    p.maxLife = 0.16;
    p.radius = rand(4, 8);
    p.color = color;
    p.kind = "electricArc";
    p.hitTargets = null;
    particles.push(p);
  }

  function spawnToxicZone(x, y, power = 1) {
    const p = getParticle();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.life = 2.35;
    p.maxLife = 2.35;
    p.radius = 18;
    p.maxRadius = 118 + power * 14;
    p.damage = 18 + power * 5;
    p.color = "#caff55";
    p.kind = "toxicZone";
    p.hitTargets = null;
    particles.push(p);
  }

  function spawnMassWave(power = 1) {
    const p = getParticle();
    if (!p) return;
    p.x = player.x;
    p.y = player.y;
    p.vx = 0;
    p.vy = 0;
    p.life = 0.92;
    p.maxLife = 0.92;
    p.radius = player.radius * 1.4;
    p.maxRadius = Math.max(camera.worldWidth || width, camera.worldHeight || height) * 0.72;
    p.damage = 28 + power * 9;
    p.color = "#ffd3dc";
    p.kind = "massWave";
    if (!p.hitTargets) p.hitTargets = new Set();
    else p.hitTargets.clear();
    particles.push(p);
  }

  function pushTrailPoint(trail, x, y, life, radius, maxLength) {
    let point = trail.length >= maxLength ? trail.pop() : null;
    if (!point) point = {};
    point.x = x;
    point.y = y;
    point.life = life;
    if (radius !== undefined) point.r = radius;
    trail.unshift(point);
  }

  function initAudio() {
    if (audio) {
      audio.context.resume();
      startBgm();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0.18;
    master.connect(context.destination);
    audio = { context, master };
    startBgm();
  }

  function startBgm() {
    if (!bgm) {
      bgm = new Audio(BGM_PATH);
      bgm.loop = true;
      bgm.volume = 0.42;
    }
    bgm.play().catch(() => {
      console.info(`[CELL] 배경음 파일을 찾지 못했거나 재생이 차단되었습니다: ${BGM_PATH}`);
    });
  }

  function playSound(kind) {
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const noise = context.createBufferSource();
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.12), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buffer;
    const settings = {
      hit: [150, 46, 0.11, 0.17, 780],
      hurt: [92, 28, 0.22, 0.24, 420],
      attack: [210, 64, 0.1, 0.13, 980],
      death: [120, 22, 0.18, 0.26, 520],
      mutate: [82, 24, 0.18, 0.62, 520],
      evolve: [54, 18, 0.28, 1.15, 360],
      level: [260, 72, 0.2, 0.48, 860],
      card: [420, 120, 0.12, 0.2, 1200],
    }[kind] || [150, 46, 0.1, 0.16, 700];
    osc.type = kind === "evolve" || kind === "mutate" ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(settings[0], now);
    osc.frequency.exponentialRampToValueAtTime(settings[1], now + settings[3]);
    filter.type = "lowpass";
    filter.frequency.value = settings[4];
    gain.gain.setValueAtTime(settings[2], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings[3]);
    osc.connect(filter);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    noise.start(now);
    osc.stop(now + settings[3] + 0.02);
    noise.stop(now + Math.min(settings[3], 0.18));
  }

  function fireProjectile(kind, x, y, target, power) {
    if (!target) return;
    const a = Math.atan2(target.y - y, target.x - x);
    fireProjectileAngle(kind, x, y, a, power);
  }

  function fireProjectileAngle(kind, x, y, angle, power) {
    const p = getProjectile();
    if (!p) return false;
    const enemyShot = kind === "phageNeedle" || kind === "phageWave";
    p.kind = kind;
    p.owner = enemyShot ? "enemy" : "player";
    p.x = x;
    p.y = y;
    const speed = kind === "swarmShard" ? 680 : kind === "spore" ? 170 : kind === "shard" ? 410 : kind === "bite" ? 520 : kind === "phageNeedle" ? 360 : kind === "phageWave" ? 245 : 330;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.radius = kind === "swarmShard" ? 5 + power * 0.35 : kind === "spore" ? 8 + power * 1.4 : kind === "shard" ? 5 + power * 0.45 : kind === "bite" ? 7 + power * 0.45 : kind === "phageNeedle" ? 9 : kind === "phageWave" ? 13 : 6 + power;
    p.damage = kind === "swarmShard" ? 9 + power * 3.2 : kind === "acid" ? 15 + power * 8 : kind === "shard" ? 12 + power * 4 : kind === "bite" ? 10 + power * 0.9 : kind === "phageNeedle" ? 18 + runTime / 60 : kind === "phageWave" ? 12 + runTime / 80 : 8 + power * 4;
    p.life = kind === "swarmShard" ? 2.2 : kind === "spore" ? 3.4 : kind === "shard" ? 0.9 : kind === "bite" ? 0.52 : kind === "phageNeedle" ? 3.2 : kind === "phageWave" ? 4.2 : 1.35;
    p.maxLife = p.life;
    p.color = kind === "swarmShard" ? "#ff89a1" : kind === "acid" ? "#caff55" : kind === "shard" ? "#ffd3dc" : kind === "bite" ? "#ff89a1" : enemyShot ? "#d8f0ff" : "#8fffd3";
    if (!p.trail) p.trail = [];
    else p.trail.length = 0;
    if (kind === "swarmShard") {
      if (!p.hitTargets) p.hitTargets = new Set();
      else p.hitTargets.clear();
    } else if (p.hitTargets) {
      p.hitTargets.clear();
    }
    projectiles.push(p);
    return true;
  }

  function nearestEnemy(range = 9999) {
    let best = null;
    let bestD = range * range;
    perf.spatialCandidates = 0;
    enemyGrid.forEachInCircle(player.x, player.y, range, (enemy) => {
      perf.spatialCandidates++;
      const d = dist2(player, enemy);
      if (d < bestD) {
        best = enemy;
        bestD = d;
      }
    });
    return best;
  }

  function sortedEnemiesInRange(range, limit = enemies.length) {
    const range2 = range * range;
    scratchEnemies.length = 0;
    enemyGrid.forEachInCircle(player.x, player.y, range, (enemy) => {
      const d = dist2(player, enemy);
      if (d <= range2) {
        enemy._queryD = d;
        scratchEnemies.push(enemy);
      }
    });
    scratchEnemies.sort((a, b) => a._queryD - b._queryD);
    if (scratchEnemies.length > limit) scratchEnemies.length = limit;
    return scratchEnemies;
  }

  function syncBalanceBucket() {
    const cursor = Math.floor(runTime / balance.bucketStep);
    if (balance.bucketCursor === cursor) return;
    if (balance.bucketCursor < 0 || cursor - balance.bucketCursor >= balance.damageBuckets.length) {
      balance.damageBuckets.fill(0);
      balance.healBuckets.fill(0);
    } else {
      for (let step = balance.bucketCursor + 1; step <= cursor; step++) {
        const index = step % balance.damageBuckets.length;
        balance.damageBuckets[index] = 0;
        balance.healBuckets[index] = 0;
      }
    }
    balance.bucketCursor = cursor;
  }

  function sumBalanceWindow(buckets) {
    let total = 0;
    for (let i = 0; i < buckets.length; i++) total += buckets[i];
    return total;
  }

  function recordDamage(amount) {
    if (amount <= 0) return;
    syncBalanceBucket();
    balance.damageBuckets[balance.bucketCursor % balance.damageBuckets.length] += amount;
  }

  function healPlayer(amount) {
    if (amount <= 0 || player.hp >= player.maxHp) return 0;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    const healed = player.hp - before;
    syncBalanceBucket();
    balance.healBuckets[balance.bucketCursor % balance.healBuckets.length] += healed;
    return healed;
  }

  function healPlayerFromKill(amount) {
    updateBalanceMetrics();
    const hpsCap = 8 + player.absorption * 4.2 + (player.evolution === "swarmOrganism" ? 8 : 0);
    const remainingBudget = Math.max(0, hpsCap * balance.window - balance.healTotal);
    return healPlayer(Math.min(amount, remainingBudget));
  }

  function estimatePlayerDps() {
    const haste = player.attackSpeed;
    let dps = (10 + player.level * 0.9) / (0.42 / haste);
    if (player.tentacles) {
      const evolved = player.evolution === "electricTentacles";
      const hits = Math.min(player.tentacles + (evolved ? 4 : 0), evolved ? 10 : 5);
      dps += hits * (17 + player.tentacles * 5 + (evolved ? 18 : 0)) / ((evolved ? 0.62 : 0.86) / haste);
      if (evolved) dps += hits * (9 + player.electric * 4) * 1.8 / (0.62 / haste);
    }
    if (player.acid) dps += (15 + player.acid * 8) / ((player.evolution === "toxicHive" ? 0.82 : 1.05) / haste) * (player.evolution === "toxicHive" ? 3 : 1);
    if (player.spores && player.evolution !== "toxicHive") dps += (player.spores + 1) * (8 + player.spores * 4) / (1.65 / haste);
    if (player.electric && player.evolution !== "electricTentacles") dps += (1 + player.electric) * (14 + player.electric * 7) / (1.25 / haste);
    if (player.splitting) {
      if (player.evolution === "swarmOrganism") dps += (18 + player.splitting * 5) * (9 + (player.splitting + player.absorption) * 3.2) * 0.48 / (0.52 / haste);
      else dps += (12 + player.splitting * 6) / (0.68 / haste);
    }
    if (player.evolution === "immortalMass") dps += (28 + (player.shell + player.regen) * 9) * 5 / (1.55 / haste);
    if (player.evolution === "toxicHive") dps += (4 + Math.min(6, player.acid + player.spores)) * (18 + (player.acid + player.spores) * 5) * 0.9;
    return dps;
  }

  function estimateAverageEnemyStats() {
    const scale = enemyProgressScale() * enemyCapDifficultyScale();
    const damageScale = (1 + runTime / 680) * enemyCapDamageScale();
    const weights = [
      ["cell", 0.46],
      ["parasite", runTime > 0 ? 0.28 : 0],
      ["toxic", runTime > 115 ? 0.16 : 0],
      ["splitter", runTime > 185 ? 0.08 : 0],
      ["giant", runTime > 330 ? 0.02 : 0],
    ];
    let weightTotal = 0;
    let hp = 0;
    let damage = 0;
    for (const [kind, weight] of weights) {
      if (weight <= 0) continue;
      const type = enemyTypes[kind];
      weightTotal += weight;
      hp += type.hp * 1.18 * scale * weight;
      damage += type.damage * damageScale * weight;
    }
    if (!weightTotal) return { hp: enemyTypes.cell.hp * scale, damage: enemyTypes.cell.damage * damageScale };
    return { hp: hp / weightTotal, damage: damage / weightTotal };
  }

  function updateBalanceMetrics() {
    balance.wave = Math.floor(runTime / 60) + 1;
    syncBalanceBucket();
    balance.damageTotal = sumBalanceWindow(balance.damageBuckets);
    balance.healTotal = sumBalanceWindow(balance.healBuckets);
    const measuredDps = balance.damageTotal / balance.window;
    const estimatedDps = estimatePlayerDps();
    balance.playerDps = measuredDps > 1 ? measuredDps : estimatedDps;
    balance.playerHps = balance.healTotal / balance.window;
    const enemyStats = estimateAverageEnemyStats();
    balance.avgEnemyHp = enemyStats.hp;
    balance.avgEnemyDamage = enemyStats.damage;
    balance.avgTtk = balance.playerDps > 0 ? balance.avgEnemyHp / balance.playerDps : Infinity;
  }

  function damageEnemy(enemy, damage, color = "#ff416d", knock = 0, source = "attack") {
    if (enemy.components && enemy.components.collision && enemy.components.collision.attackImmune && source !== "contact") {
      enemy.hit = 0.12;
      enemy.components.render.flash = 0.12;
      spawnText(enemy.x, enemy.y - enemy.radius, "IMMUNE", "#d4fff0");
      return false;
    }
    const beforeHp = enemy.hp;
    enemy.hp -= damage;
    if (source !== "contact") recordDamage(Math.max(0, Math.min(beforeHp, damage)));
    enemy.hit = 0.22;
    if (enemy.components && enemy.components.render) enemy.components.render.flash = 0.2;
    enemy.pulse = 1;
    if (knock) {
      const a = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      enemy.vx += Math.cos(a) * knock;
      enemy.vy += Math.sin(a) * knock;
    }
    spawnParticle(enemy.x, enemy.y, color, 10, 0.75, 0.55);
    spawnParticle(enemy.x, enemy.y, "#5d0016", 7, 0.55, 0.75);
    if (damage >= 18) {
      hitStop = Math.max(hitStop, 0.035);
      shake = Math.max(shake, 2.2);
    }
    spawnText(enemy.x, enemy.y - enemy.radius, Math.round(damage).toString(), color);
    if (Math.random() < 0.45) playSound("hit");
    if (enemy.hp <= 0) killEnemy(enemy);
    return true;
  }

  function applyEvolutionBonus(id) {
    if (id === "electricTentacles") {
      player.attackSpeed += 0.32;
      player.speed += 18;
    } else if (id === "toxicHive") {
      player.slime = Math.max(player.slime, 1);
      player.regen += 1.5;
    } else if (id === "immortalMass") {
      player.armor += 0.16;
      player.maxHp += 50;
      player.hp += 50;
    } else if (id === "swarmOrganism") {
      player.absorption = Math.max(player.absorption, 2);
      player.attackSpeed += 0.18;
    }
  }

  function damagePlayer(amount, enemy) {
    const damage = amount * 0.72 * (1 - player.armor);
    player.hp -= damage;
    playerHurt = 1;
    screenPulse = Math.max(screenPulse, 0.36);
    hitStop = Math.max(hitStop, enemy.kind === "giant" ? 0.09 : 0.045);
    shake = Math.max(shake, enemy.kind === "giant" ? 12 : 6);
    const push = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    player.vx += Math.cos(push) * (enemy.kind === "giant" ? 280 : 150);
    player.vy += Math.sin(push) * (enemy.kind === "giant" ? 280 : 150);
    spawnParticle(player.x, player.y, "#ffedf0", 10, 0.9, 0.35);
    spawnParticle(player.x, player.y, "#a30034", 18, 1.15, 0.8);
    spawnText(player.x, player.y - player.radius - 10, "피격", "#ffedf0");
    playSound("hurt");
  }

  function killEnemy(enemy) {
    if (enemy.kind === "phage") {
      winRun();
      const index = enemies.indexOf(enemy);
      if (index >= 0) enemies.splice(index, 1);
      freeEnemy(enemy);
      return;
    }
    player.kills++;
    player.xp += enemy.xp * xpMultiplier();
    const swarmHeal = player.evolution === "swarmOrganism" ? 6 : 0;
    healPlayerFromKill(player.absorption * 1.9 + swarmHeal);
    shake = Math.max(shake, enemy.radius * 0.07);
    spawnParticle(enemy.x, enemy.y, enemy.color, enemy.kind === "giant" ? 42 : 13, enemy.kind === "giant" ? 1.7 : 1, 1.1);
    for (let i = 0; i < 8 + player.absorption * 3; i++) {
      const p = getParticle();
      if (!p) break;
      p.x = enemy.x;
      p.y = enemy.y;
      p.vx = (player.x - enemy.x) * rand(0.9, 1.6);
      p.vy = (player.y - enemy.y) * rand(0.9, 1.6);
      p.life = 0.55;
      p.maxLife = 0.55;
      p.radius = rand(2, 4.5);
      p.color = "#8fffd3";
      p.kind = "absorb";
      particles.push(p);
    }
    playSound("death");
    if (enemy.kind === "splitter" && !enemy.splitDone) {
      for (let i = 0; i < 2; i++) spawnEnemy("parasite");
    }
    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);
    freeEnemy(enemy);
    if (state === "play" && player.xp >= player.nextXp) {
      player.xp -= player.nextXp;
      player.level++;
      player.nextXp = Math.floor(player.nextXp * 1.28 + 8);
      openMutation();
    }
  }

  function openMutation() {
    if (state !== "play") return;
    state = "mutation";
    choices = [];
    choices = pickMutationChoices(3);
    choiceGrid.innerHTML = "";
    mutationTitle.textContent = player.level < 4 ? "부드러운 것이 안쪽에서 벌어진다." : player.level < 9 ? "형태가 협상을 거부하기 시작한다." : "군체가 굶주림을 학습했다.";
    choices.forEach((mutation) => {
      const button = document.createElement("button");
      const current = stackOf(mutation.id);
      button.className = "choice";
      button.innerHTML = `<strong>${mutation.name}</strong><span>${mutation.type}</span><b class="tag">${mutation.tag}</b><div class="stack">${stackPips(current)}</div><span>${mutation.desc}</span><em class="path">진화 암시: ${mutation.path}</em>`;
      button.querySelector(".path").textContent = `진화 암시: ${mutation.path}`;
      button.addEventListener("click", () => chooseMutation(mutation));
      choiceGrid.appendChild(button);
    });
    mutationPanel.classList.remove("hidden");
    playSound("level");
    screenPulse = Math.max(screenPulse, 0.45);
    hitStop = Math.max(hitStop, 0.08);
  }

  function pickMutationChoices(count) {
    const pool = mutations
      .filter((mutation) => stackOf(mutation.id) < MAX_STACK)
      .map((mutation) => ({ mutation, weight: mutationWeight(mutation) }));
    const picked = [];
    while (picked.length < count && pool.length) {
      const total = pool.reduce((sum, item) => sum + item.weight, 0);
      let roll = Math.random() * total;
      const index = pool.findIndex((item) => {
        roll -= item.weight;
        return roll <= 0;
      });
      const safeIndex = index < 0 ? pool.length - 1 : index;
      picked.push(pool[safeIndex].mutation);
      pool.splice(safeIndex, 1);
    }
    return picked;
  }

  function mutationWeight(mutation) {
    const stack = stackOf(mutation.id);
    let weight = 1 + stack * 1.65;
    if (stack >= 3) weight += 1.75;
    const relatedEvolution = evolutionDefs.find((evo) => evo.needs.includes(mutation.id));
    if (relatedEvolution && !player.evolution) {
      const hasPartner = relatedEvolution.needs.some((id) => id !== mutation.id && stackOf(id) > 0);
      if (hasPartner) weight += 2.2;
    }
    return weight;
  }

  function stackOf(id) {
    if (id === "acceleration") return player.accelStack;
    return player[id] || 0;
  }

  function stackPips(current) {
    let html = "";
    for (let i = 0; i < MAX_STACK; i++) html += `<i class="${i < current ? "on" : ""}"></i>`;
    return html;
  }

  function chooseMutation(mutation) {
    const before = stackOf(mutation.id);
    playSound("card");
    mutation.apply();
    const after = stackOf(mutation.id);
    console.debug(`[CELL] 변이 선택: ${mutation.name} ${before}->${after}`);
    player.radius += 2.4;
    player.maxHp += 4;
    player.hp = Math.min(player.maxHp, player.hp + 18);
    player.mutationPulse = 0.5;
    spawnParticle(player.x, player.y, "#ff416d", 60, 1.7, 1.3);
    spawnParticle(player.x, player.y, "#8fffd3", 22, 1.2, 0.8);
    playSound("mutate");
    checkEvolution();
    mutationPanel.classList.add("hidden");
    shake = Math.max(shake, 8);
    state = "play";
    if (player.xp >= player.nextXp) {
      player.xp -= player.nextXp;
      player.level++;
      player.nextXp = Math.floor(player.nextXp * 1.28 + 8);
      openMutation();
    }
  }

  function checkEvolution() {
    const old = player.evolution;
    for (const evo of evolutionDefs) {
      const ready = evo.needs.every((id) => stackOf(id) >= EVOLUTION_STACK);
      console.debug(`[CELL] 진화 검증: ${evo.name} ${ready ? "가능" : "미충족"}`);
      if (ready && !player.evolution) {
        player.evolution = evo.id;
        player.evolutionName = evo.name;
        break;
      }
    }
    if (old !== player.evolution && player.evolution) {
      applyEvolutionBonus(player.evolution);
      player.radius += 10;
      player.maxHp += 35;
      player.hp = player.maxHp;
      spawnParticle(player.x, player.y, "#8fffd3", 100, 2.2, 1.8);
      spawnParticle(player.x, player.y, "#ff315f", 120, 2.4, 1.8);
      screenPulse = 1;
      hitStop = 0.22;
      shake = Math.max(shake, 18);
      bannerTimer = 2.2;
      evolutionText.textContent = player.evolutionName;
      evolutionBanner.classList.remove("hidden");
      playSound("evolve");
      console.debug(`[CELL] 진화 발현: ${player.evolutionName}`);
    }
  }

  function update(dt) {
    pulse += dt;
    hitStop = Math.max(0, hitStop - dt);
    playerHurt = Math.max(0, playerHurt - dt * 3.8);
    screenPulse = Math.max(0, screenPulse - dt * 1.6);
    bannerTimer = Math.max(0, bannerTimer - dt);
    if (painFlash) painFlash.style.opacity = (Math.max(playerHurt, screenPulse * 0.45) * quality.screenEffectScale).toFixed(3);
    if (bannerTimer <= 0) evolutionBanner.classList.add("hidden");
    if (state === "paused") {
      updateHud();
      return;
    }
    if (state !== "play") {
      updateParticles(dt);
      return;
    }
    if (hitStop > 0) {
      updateParticles(dt * 0.35);
      updatePerformanceGuard(dt);
      updateHud();
      return;
    }

    runTime += dt;
    updatePerformanceGuard(dt);
    updateCamera(dt);
    updateSession();
    spawnTimer -= dt;
    bossTimer -= dt;
    for (let i = 0; i < cooldownKeys.length; i++) {
      const key = cooldownKeys[i];
      player.cooldowns[key] = Math.max(0, player.cooldowns[key] - dt);
    }

    const pressure = 1.25 + runTime / 120;
    if (!finalPhase && spawnTimer <= 0) {
      const count = Math.min(7, 2 + Math.floor(runTime / 70));
      for (let i = 0; i < count; i++) {
        const roll = Math.random();
        const kind = runTime > 330 && roll < 0.06 ? "giant" : runTime > 185 && roll < 0.18 ? "splitter" : runTime > 115 && roll < 0.34 ? "toxic" : roll < 0.54 ? "parasite" : "cell";
        spawnEnemy(kind);
      }
      spawnTimer = Math.max(0.24, 1.35 / pressure);
    }
    if (!finalPhase && bossTimer <= 0) {
      spawnEnemy("giant");
      bossTimer = Math.max(30, 68 - runTime / 20);
    }

    enemyGrid.rebuild(enemies);
    updatePlayer(dt);
    updateAttacks(dt);
    updateEnemies(dt);
    enemyGrid.rebuild(enemies);
    updateProjectiles(dt);
    updateParticles(dt);
    updateBalanceMetrics();
    updateHud();
    if (player.hp <= 0) endRun();
  }

  function updateSession() {
    while (session.tutorialIndex < session.tutorialMarks.length && runTime >= session.tutorialMarks[session.tutorialIndex]) {
      spawnEnemy("tutorial");
      session.tutorialIndex++;
    }
    while (!finalPhase && session.nextWaveAt < session.finalPhaseAt && runTime >= session.nextWaveAt) {
      session.waveIndex++;
      spawnWave(session.waveIndex);
      session.nextWaveAt += 180;
    }
    if (!finalPhase && runTime >= session.finalPhaseAt) {
      finalPhase = true;
      spawnTimer = Infinity;
      bossTimer = Infinity;
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].kind !== "phage") freeEnemy(enemies.splice(i, 1)[0]);
      }
      if (!finalBossSpawned) {
        finalBossSpawned = true;
        spawnEnemy("phage");
        spawnText(player.x, player.y - player.radius - 28, "BACTERIOPHAGE", "#d8f0ff");
        screenPulse = 1;
        shake = Math.max(shake, 24);
      }
    }
  }

  function spawnWave(waveIndex) {
    const spawnBudget = Math.min(MAX_ENEMIES - enemies.length, 14 + waveIndex * 4);
    if (spawnBudget <= 0) {
      addEnemyCapPressure(1.2);
      return;
    }
    const heavyCount = Math.min(4 + Math.floor(waveIndex / 2), Math.floor(spawnBudget * 0.32));
    const splitterCount = runTime > 185 ? Math.min(5, Math.floor(spawnBudget * 0.22)) : 0;
    const toxicCount = runTime > 115 ? Math.min(6, Math.floor(spawnBudget * 0.24)) : 0;
    const parasiteCount = Math.max(0, Math.floor(spawnBudget * 0.28));
    let spawned = 0;

    for (let i = 0; i < heavyCount && spawned < spawnBudget; i++, spawned++) spawnEnemy(waveIndex >= 2 && i === 0 ? "giant" : "cell");
    for (let i = 0; i < splitterCount && spawned < spawnBudget; i++, spawned++) spawnEnemy("splitter");
    for (let i = 0; i < toxicCount && spawned < spawnBudget; i++, spawned++) spawnEnemy("toxic");
    for (let i = 0; i < parasiteCount && spawned < spawnBudget; i++, spawned++) spawnEnemy("parasite");
    while (spawned < spawnBudget) {
      spawnEnemy(spawned % 3 === 0 ? "parasite" : "cell");
      spawned++;
    }

    spawnTimer = Math.min(spawnTimer, 0.42);
    screenPulse = Math.max(screenPulse, 0.34);
    shake = Math.max(shake, 8);
    spawnText(player.x, player.y - player.radius - 34, `WAVE ${waveIndex}`, "#d4fff0");
  }

  function updatePlayer(dt) {
    let ix = 0;
    let iy = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) iy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) iy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
    if (mobilePointer) {
      ix += mobilePointer.x - player.x;
      iy += mobilePointer.y - player.y;
    }
    const mag = Math.hypot(ix, iy) || 1;
    ix /= mag;
    iy /= mag;
    const dashBoost = player.dash && player.cooldowns.dash <= 0 && (Math.abs(ix) + Math.abs(iy) > 0) ? 2.4 : 1;
    if (dashBoost > 1) {
      player.cooldowns.dash = Math.max(0.7, 1.8 - player.dash * 0.22);
      spawnParticle(player.x, player.y, "#ff315f", 18, 0.8, 0.55);
    }
    player.vx += (ix * player.speed * dashBoost - player.vx) * clamp(dt * player.acceleration, 0, 1);
    player.vy += (iy * player.speed * dashBoost - player.vy) * clamp(dt * player.acceleration, 0, 1);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    healPlayer(player.regen * dt);
    player.mutationPulse = Math.max(0, player.mutationPulse - dt * 1.6);
    pushTrailPoint(player.trail, player.x, player.y, 1, player.radius * 0.75, 48 + player.slime * 18);
    for (const t of player.trail) t.life -= dt * (player.slime ? 0.7 : 1.7);
  }

  function updateAttacks(dt) {
    const haste = player.attackSpeed;
    if (player.cooldowns.bite <= 0) {
      const target = nearestEnemy(360 + player.radius * 1.8);
      if (target) {
        fireProjectile("bite", player.x, player.y, target, player.level);
        playSound("attack");
      }
      player.cooldowns.bite = 0.42 / haste;
    }
    if (player.tentacles && player.cooldowns.lash <= 0) {
      const evolved = player.evolution === "electricTentacles";
      const range = tentacleRange();
      const lashes = Math.min(player.tentacles + (evolved ? 4 : 0), evolved ? 10 : 5);
      const targets = sortedEnemiesInRange(range, lashes);
      for (const target of targets) {
        if (target) {
          damageEnemy(target, 17 + player.tentacles * 5 + (evolved ? 18 : 0), evolved ? "#8fffd3" : "#ff416d", evolved ? 170 : 110);
          spawnParticle(target.x, target.y, evolved ? "#8fffd3" : "#ff315f", evolved ? 24 : 16, evolved ? 1.25 : 1, 0.45);
          if (evolved) {
            const angle = Math.atan2(target.y - player.y, target.x - player.x);
            const tipX = player.x + Math.cos(angle) * Math.min(range, Math.hypot(target.x - player.x, target.y - player.y) * 0.72);
            const tipY = player.y + Math.sin(angle) * Math.min(range, Math.hypot(target.x - player.x, target.y - player.y) * 0.72);
            spawnElectricArc(tipX, tipY, target.x, target.y);
            enemyGrid.forEachInCircle(target.x, target.y, 175, (near) => {
              if (near !== target && (near.x - target.x) ** 2 + (near.y - target.y) ** 2 < 175 ** 2) {
                damageEnemy(near, 9 + player.electric * 4, "#8fffd3", 70);
                spawnElectricArc(target.x, target.y, near.x, near.y, "#d4fff0");
              }
            });
          }
        }
      }
      if (targets.length) playSound("attack");
      player.cooldowns.lash = (evolved ? 0.62 : 0.86) / haste;
    }
    if (player.acid && player.cooldowns.acid <= 0) {
      const target = nearestEnemy(760);
      if (player.evolution === "toxicHive" && target) {
        const base = Math.atan2(target.y - player.y, target.x - player.x);
        for (let i = -1; i <= 1; i++) fireProjectileAngle("acid", player.x, player.y, base + i * 0.28, player.acid + 2);
      } else {
        fireProjectile("acid", player.x, player.y, target, player.acid);
      }
      playSound("attack");
      player.cooldowns.acid = (player.evolution === "toxicHive" ? 0.82 : 1.05) / haste;
    }
    if (player.spores && player.cooldowns.spore <= 0 && player.evolution !== "toxicHive") {
      const spread = player.spores + 1;
      for (let i = 0; i < spread; i++) {
        fireProjectile("spore", player.x, player.y, nearestEnemy(640), player.spores);
      }
      playSound("attack");
      player.cooldowns.spore = 1.65 / haste;
    }
    if (player.electric && player.cooldowns.spark <= 0 && player.evolution !== "electricTentacles") {
      const arcs = 1 + player.electric;
      const range = electricRange();
      const targets = sortedEnemiesInRange(range, arcs);
      for (const enemy of targets) damageEnemy(enemy, 14 + player.electric * 7, "#8fffd3", 40);
      playSound("attack");
      player.cooldowns.spark = 1.25 / haste;
    }
    if (player.splitting && player.cooldowns.split <= 0) {
      const evolved = player.evolution === "swarmOrganism";
      if (evolved) {
        const count = Math.max(10, Math.floor((18 + player.splitting * 5) * clamp(perfGuard.effectScale + 0.18, 0.45, 1)));
        const base = pulse * 3.6;
        for (let i = 0; i < count; i++) {
          fireProjectileAngle("swarmShard", player.x, player.y, base + (i / count) * TAU, player.splitting + player.absorption);
        }
        spawnParticle(player.x, player.y, "#ff89a1", 26, 1.15, 0.42);
        playSound("attack");
        player.cooldowns.split = 0.52 / haste;
        return;
      }
      const targets = sortedEnemiesInRange(220, 1);
      for (const target of targets) {
        damageEnemy(target, 12 + player.splitting * 6, "#ffd2dc", 80);
        spawnParticle(target.x, target.y, "#ffd2dc", 4, 0.9, 0.42);
      }
      if (targets.length) playSound("attack");
      player.cooldowns.split = 0.68 / haste;
    }

    if (player.evolution === "immortalMass" && player.cooldowns.shell <= 0) {
      spawnMassWave(player.shell + player.regen);
      spawnParticle(player.x, player.y, "#ffd3dc", 42, 1.25, 0.55);
      playSound("attack");
      player.cooldowns.shell = 1.55 / haste;
    }

    if (player.evolution === "toxicHive") {
      if (player.cooldowns.toxin <= 0) {
        const zones = Math.max(2, Math.floor((4 + Math.min(6, player.acid + player.spores)) * clamp(perfGuard.effectScale + 0.12, 0.45, 1)));
        const left = camera.x - (width / 2) / camera.scale;
        const right = camera.x + (width / 2) / camera.scale;
        const top = camera.y - (height / 2) / camera.scale;
        const bottom = camera.y + (height / 2) / camera.scale;
        for (let i = 0; i < zones; i++) {
          spawnToxicZone(rand(left, right), rand(top, bottom), player.acid + player.spores);
        }
        playSound("attack");
        player.cooldowns.toxin = 1.9 / haste;
      }
    }
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const targetRadius = (enemy.baseRadius || enemy.radius) * enemySizeScale(enemy.kind);
      enemy.radius += (targetRadius - enemy.radius) * clamp(dt * 1.4, 0, 1);
      if (enemy.kind !== "tutorial") {
        const stats = enemy.components && enemy.components.stats ? enemy.components.stats : null;
        const baseDamage = stats ? stats.baseDamage : enemy.baseDamage || enemy.damage;
        const baseSpeed = stats ? stats.baseSpeed : enemy.speed;
        enemy.damage = baseDamage * (enemy.kind === "phage" ? 1 + runTime / 720 : 1 + runTime / 680) * enemyCapDamageScale();
        enemy.speed = baseSpeed * (1.08 + runTime / 620) * enemyCapSpeedScale();
        const targetMaxHp = (stats ? stats.baseHp : enemy.maxHp) * (enemy.kind === "phage" ? 1 + runTime / 300 : enemyProgressScale()) * enemyCapDifficultyScale();
        if (targetMaxHp > enemy.maxHp) {
          const delta = targetMaxHp - enemy.maxHp;
          enemy.maxHp += delta * clamp(dt * 0.45, 0, 1);
          enemy.hp += delta * clamp(dt * 0.25, 0, 1);
        }
      }
      updateBoss(enemy, dt);
      const aim = enemy.components && enemy.components.movement ? enemy.components.movement : null;
      if (aim) applyEnemyBehavior(enemy, player, dt);
      const targetX = aim ? aim.targetX : player.x;
      const targetY = aim ? aim.targetY : player.y;
      const a = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      let slow = 1;
      if (player.slime) {
        for (let j = 0; j < player.trail.length; j += 3) {
          const t = player.trail[j];
          if (t.life > 0 && (enemy.x - t.x) ** 2 + (enemy.y - t.y) ** 2 < (t.r + enemy.radius) ** 2) {
            slow = 0.45;
            if (!(enemy.components && enemy.components.collision && enemy.components.collision.attackImmune)) {
              enemy.hp -= player.slime * dt * 5;
              if (enemy.components && enemy.components.render) enemy.components.render.flash = Math.max(enemy.components.render.flash, 0.04);
            }
            break;
          }
        }
      }
      enemy.vx += (Math.cos(a) * enemy.speed * slow - enemy.vx) * clamp(dt * 4, 0, 1);
      enemy.vy += (Math.sin(a) * enemy.speed * slow - enemy.vy) * clamp(dt * 4, 0, 1);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.hit = Math.max(0, enemy.hit - dt);
      if (enemy.components && enemy.components.render) enemy.components.render.flash = Math.max(0, enemy.components.render.flash - dt);
      enemy.pulse = Math.max(0, (enemy.pulse || 0) - dt * 4);
      const collide = player.radius + enemy.radius;
      if ((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2 < collide * collide) {
        if (enemy.components && enemy.components.collision && enemy.components.collision.contactBreak) {
          damageEnemy(enemy, enemy.maxHp, "#d4fff0", 0, "contact");
          screenPulse = Math.max(screenPulse, 0.22);
          continue;
        }
        if (runTime - lastContactHit > 0.28) {
          damagePlayer(enemy.damage, enemy);
          lastContactHit = runTime;
        }
        const push = Math.atan2(enemy.y - player.y, enemy.x - player.x);
        enemy.vx += Math.cos(push) * 180;
        enemy.vy += Math.sin(push) * 180;
        enemy.x += Math.cos(push) * 58 * dt;
        enemy.y += Math.sin(push) * 58 * dt;
        shake = Math.max(shake, 3.2);
      }
      if (enemy.hp <= 0) killEnemy(enemy);
    }
  }

  function updateBoss(enemy, dt) {
    if (enemy.kind !== "phage" || !enemy.components || !enemy.components.boss) return;
    const boss = enemy.components.boss;
    boss.attackTimer -= dt;
    boss.waveTimer -= dt;
    if (boss.attackTimer <= 0) {
      const base = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      for (let i = -2; i <= 2; i++) fireProjectileAngle("phageNeedle", enemy.x, enemy.y, base + i * 0.16, 1);
      spawnParticle(enemy.x, enemy.y, "#d8f0ff", 22, 1.4, 0.75);
      boss.attackTimer = Math.max(1.6, 3.4 - runTime / 420);
    }
    if (boss.waveTimer <= 0) {
      const count = 16;
      const offset = pulse * 0.4;
      for (let i = 0; i < count; i++) fireProjectileAngle("phageWave", enemy.x, enemy.y, offset + (i / count) * TAU, 1);
      screenPulse = Math.max(screenPulse, 0.45);
      shake = Math.max(shake, 12);
      boss.waveTimer = Math.max(5.2, 9 - runTime / 260);
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      pushTrailPoint(p.trail, p.x, p.y, 1, undefined, perfGuard.trailLimit);
      for (const t of p.trail) t.life -= dt * 4.2;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "spore") {
        p.vx *= 0.992;
        p.vy *= 0.992;
      }
      let used = false;
      if (p.owner === "enemy") {
        if ((p.x - player.x) ** 2 + (p.y - player.y) ** 2 < (p.radius + player.radius) ** 2) {
          enemyProjectileHit.x = p.x;
          enemyProjectileHit.y = p.y;
          damagePlayer(p.damage, enemyProjectileHit);
          used = true;
        }
      } else {
      let hitEnemy = null;
      enemyGrid.forEachInCircle(p.x, p.y, p.radius + 140, (enemy) => {
        if (hitEnemy && p.kind !== "swarmShard") return;
        if (p.kind === "swarmShard" && p.hitTargets && p.hitTargets.has(enemy)) return;
        if ((p.x - enemy.x) ** 2 + (p.y - enemy.y) ** 2 < (p.radius + enemy.radius) ** 2) {
          const applied = damageEnemy(enemy, p.damage, p.color, p.kind === "acid" ? 70 : p.kind === "bite" ? 85 : 25, "projectile");
          if (applied && p.kind === "bite") spawnParticle(p.x, p.y, "#ffedf0", 8, 0.7, 0.28);
          if (applied && p.kind === "swarmShard") {
            p.hitTargets.add(enemy);
            spawnParticle(p.x, p.y, "#ff89a1", 5, 0.55, 0.24);
            return;
          }
          if (p.kind === "acid") {
            spawnParticle(p.x, p.y, "#caff55", 18, 1, 0.8);
            if (applied) enemyGrid.forEachInCircle(p.x, p.y, 92, (near) => {
              if (near !== enemy && (p.x - near.x) ** 2 + (p.y - near.y) ** 2 < 92 ** 2) damageEnemy(near, p.damage * 0.42, "#caff55", 20, "poison");
            });
          }
          if (p.kind === "spore" && player.evolution === "toxicHive") {
            spawnParticle(p.x, p.y, "#caff55", 20, 0.95, 0.9);
            if (applied) enemyGrid.forEachInCircle(p.x, p.y, 118, (near) => {
              if (near !== enemy && (p.x - near.x) ** 2 + (p.y - near.y) ** 2 < 118 ** 2) damageEnemy(near, p.damage * 0.55, "#caff55", 28, "poison");
            });
          }
          used = true;
          hitEnemy = enemy;
        }
      });
      }
      const left = camera.x - (width / 2) / camera.scale - 160;
      const right = camera.x + (width / 2) / camera.scale + 160;
      const top = camera.y - (height / 2) / camera.scale - 160;
      const bottom = camera.y + (height / 2) / camera.scale + 160;
      if (used || p.life <= 0 || p.x < left || p.x > right || p.y < top || p.y > bottom) {
        recycleProjectileAt(i);
      }
    }
  }

  function updateParticles(dt) {
    cullRect.left = camera.x - (width / 2) / camera.scale - 260;
    cullRect.right = camera.x + (width / 2) / camera.scale + 260;
    cullRect.top = camera.y - (height / 2) / camera.scale - 260;
    cullRect.bottom = camera.y + (height / 2) / camera.scale + 260;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.kind === "toxicZone") {
        const t = 1 - clamp(p.life / p.maxLife, 0, 1);
        p.radius = p.maxRadius * (1 - Math.pow(1 - t, 2));
        enemyGrid.forEachInCircle(p.x, p.y, p.radius, (enemy) => {
          if (enemy.components && enemy.components.collision && enemy.components.collision.attackImmune) return;
          if ((enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2 < (enemy.radius + p.radius) ** 2) {
            enemy.hp -= p.damage * dt;
            if (enemy.components && enemy.components.render) enemy.components.render.flash = Math.max(enemy.components.render.flash, 0.05);
            if (Math.random() < dt * 9) spawnParticle(enemy.x, enemy.y, "#caff55", 1, 0.35, 0.35);
          }
        });
      } else if (p.kind === "massWave") {
        const t = 1 - clamp(p.life / p.maxLife, 0, 1);
        p.radius = p.maxRadius * t;
        const band = 26 + player.shell * 4;
        enemyGrid.forEachInCircle(p.x, p.y, p.radius + band, (enemy) => {
          if (p.hitTargets && p.hitTargets.has(enemy)) return;
          const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (Math.abs(d - p.radius) < band + enemy.radius) {
            p.hitTargets.add(enemy);
            damageEnemy(enemy, p.damage, "#ffd3dc", 220, "wave");
          }
        });
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const cullOffscreen = p.kind === "splash" || p.kind === "text" || p.kind === "absorb" || p.kind === "electricArc";
      if (p.life <= 0 || (cullOffscreen && isOutsideRect(p, cullRect, 80))) {
        recycleParticleAt(i);
      }
    }
    shake = Math.max(0, shake - dt * 15);
  }

  function draw() {
    perf.drawCalls = 0;
    viewRect.left = camera.x - (width / 2) / camera.scale - 120;
    viewRect.right = camera.x + (width / 2) / camera.scale + 120;
    viewRect.top = camera.y - (height / 2) / camera.scale - 120;
    viewRect.bottom = camera.y + (height / 2) / camera.scale + 120;
    const sx = shake ? rand(-shake, shake) : 0;
    const sy = shake ? rand(-shake, shake) : 0;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    ctx.translate(width / 2 + sx, height / 2 + sy);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);
    drawWorldGrid();
    drawSlimeTrail();
    drawTargeting();
    drawElectricRange();
    drawProjectiles();
    drawEnemies();
    drawEvolutionAura();
    drawPlayer();
    drawParticles();
    ctx.restore();
    drawScreenEffects();
    drawDebugPanel();
  }

  function drawDebugPanel() {
    const effects = countEffects(particles);
    const lines = [
      `FPS: ${Math.round(perf.fps)}`,
      `Wave: ${balance.wave}`,
      `Enemies: ${enemies.length} / ${MAX_ENEMIES}`,
      `Projectiles: ${projectiles.length}`,
      `Particles: ${particles.length} / ${MAX_PARTICLES}`,
      `Effects: ${effects}`,
      `Draw Calls: ${perf.drawCalls}`,
      `Memory: ${readMemoryUsage()}`,
      `Active Mutations: ${activeMutationCount(player)}`,
      `Enemy Cap: ${MAX_ENEMIES} (${runtimeConfig.mobile ? "Mobile" : "PC"})`,
      `Enemy HP: ${Math.round(balance.avgEnemyHp)}`,
      `Enemy Damage: ${balance.avgEnemyDamage.toFixed(1)}`,
      `Player DPS: ${balance.playerDps.toFixed(1)}`,
      `Player HPS: ${balance.playerHps.toFixed(1)}`,
      `Average TTK: ${balance.avgTtk === Infinity ? "n/a" : `${balance.avgTtk.toFixed(2)}s`}`,
      `FX Scale: ${perfGuard.effectScale.toFixed(2)}`,
      `Trail: ${perfGuard.trailLimit}`,
    ];
    if (enemyCapBonus > 0) lines.push(`Cap Scaling: +${Math.round(enemyCapBonus * 100)}%`);
    const x = 14;
    const y = Math.max(14, height - 18 - lines.length * 18);
    const w = 248;
    const h = lines.length * 18 + 14;

    ctx.save();
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(2, 3, 5, 0.68)";
    ctx.strokeStyle = enemies.length >= MAX_ENEMIES ? "rgba(255, 65, 109, 0.72)" : "rgba(143, 255, 211, 0.28)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 1 && enemies.length >= MAX_ENEMIES ? "#ff89a1" : "#d4fff0";
      ctx.fillText(lines[i], x + 10, y + 8 + i * 18);
    }
    ctx.restore();
  }

  function drawTargeting() {
    const target = nearestEnemy(840 / camera.scale);
    if (!target) return;
    const alpha = 0.18 + Math.sin(pulse * 9) * 0.05;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = target.components && target.components.collision && target.components.collision.attackImmune ? "#d4fff0" : "#ff89a1";
    ctx.lineWidth = 1.5 / camera.scale;
    ctx.setLineDash([8 / camera.scale, 12 / camera.scale]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius * 1.45, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawElectricRange() {
    if (!player.electric) return;
    const evolved = player.evolution === "electricTentacles";
    if (evolved) return;
    const range = electricRange();
    const charge = clamp(1 - player.cooldowns.spark / ((evolved ? 0.74 : 1.25) / player.attackSpeed), 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.1 + charge * 0.16;
    ctx.fillStyle = "#8fffd3";
    ctx.beginPath();
    ctx.arc(player.x, player.y, range, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.38 + charge * 0.28;
    ctx.strokeStyle = "#8fffd3";
    ctx.lineWidth = (1.5 + player.electric * 0.35) / camera.scale;
    ctx.setLineDash([10 / camera.scale, 9 / camera.scale]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, range, pulse * 0.7, pulse * 0.7 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.18 + charge * 0.32;
    for (let i = 0; i < player.electric + 2; i++) {
      const a = pulse * (1.4 + i * 0.12) + (i / (player.electric + 2)) * TAU;
      ctx.beginPath();
      ctx.arc(player.x, player.y, range * (0.78 + i * 0.05), a, a + 0.2 + charge * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEvolutionAura() {
    if (!player.evolution) return;
    const colors = {
      electricTentacles: "#8fffd3",
      toxicHive: "#caff55",
      immortalMass: "#ffd3dc",
      swarmOrganism: "#ff89a1",
    };
    const color = colors[player.evolution] || "#ffffff";
    const r = player.radius * (1.8 + Math.sin(pulse * 3) * 0.08);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.44;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2 / camera.scale;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 1.08, pulse * 0.9, pulse * 0.9 + TAU * 0.72);
    ctx.stroke();
    if (player.evolution === "swarmOrganism") {
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 6; i++) {
        const a = pulse * 2.2 + (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(player.x + Math.cos(a) * r * 0.9, player.y + Math.sin(a) * r * 0.9, player.radius * 0.16, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawScreenEffects() {
    if (screenPulse <= 0) return;
    ctx.save();
    ctx.globalAlpha = screenPulse * 0.45 * quality.screenEffectScale;
    ctx.fillStyle = playerHurt > 0 ? "#ff0036" : "#8fffd3";
    ctx.fillRect(0, 0, width, height);
    perf.drawCalls++;
    ctx.globalAlpha = screenPulse * 0.7 * quality.screenEffectScale;
    ctx.strokeStyle = playerHurt > 0 ? "#ffedf0" : "#ff315f";
    ctx.lineWidth = 8 + screenPulse * 12;
    ctx.strokeRect(8, 8, width - 16, height - 16);
    perf.drawCalls++;
    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.max(width, height) * 0.78);
    g.addColorStop(0, "#111016");
    g.addColorStop(0.48, "#08090d");
    g.addColorStop(1, "#020305");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    perf.drawCalls++;
    const horror = clamp((runTime - 180) / 180, 0, 1);
    if (horror > 0) {
      ctx.globalAlpha = horror * 0.16;
      ctx.fillStyle = "#ff315f";
      ctx.fillRect(0, 0, width, height);
      perf.drawCalls++;
      ctx.globalAlpha = 1;
    }
  }

  function drawWorldGrid() {
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#253c39";
    ctx.lineWidth = 1 / camera.scale;
    const grid = 56;
    const left = camera.x - width / camera.scale;
    const right = camera.x + width / camera.scale;
    const top = camera.y - height / camera.scale;
    const bottom = camera.y + height / camera.scale;
    const ox = Math.floor(left / grid) * grid;
    const oy = Math.floor(top / grid) * grid;
    for (let x = ox; x < right + grid; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + Math.sin(pulse + x) * 18, bottom);
      ctx.stroke();
      perf.drawCalls++;
    }
    for (let y = oy; y < bottom + grid; y += grid) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y + Math.cos(pulse + y) * 18);
      ctx.stroke();
      perf.drawCalls++;
    }
    const horror = clamp((runTime - 180) / 180, 0, 1);
    if (horror > 0) {
      ctx.globalAlpha = horror * 0.22;
      ctx.strokeStyle = "#ff315f";
      ctx.lineWidth = 2;
      for (let i = 0; i < 16 * horror; i++) {
        const y = top + ((i / 16) * (bottom - top)) + Math.sin(pulse + i) * 40;
        ctx.beginPath();
        ctx.moveTo(left, y);
        for (let x = left; x <= right; x += 90) ctx.lineTo(x, y + Math.sin(pulse * 2 + i + x * 0.02) * 26);
        ctx.stroke();
        perf.drawCalls++;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSlimeTrail() {
    if (!player.trail.length) return;
    for (const t of player.trail) {
      if (t.life <= 0) continue;
      const r = t.r * t.life * (player.slime ? 1.1 : 0.32);
      ctx.globalAlpha = t.life * (player.slime ? 0.22 : 0.06);
      ctx.fillStyle = player.slime ? "#89ffbf" : "#ff416d";
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, TAU);
      ctx.fill();
      perf.drawCalls++;
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const mutationCount = player.tentacles + player.acid + player.electric + player.spores + player.eyes + player.shell + player.splitting + player.absorption + player.slime + player.dash + player.accelStack;
    const wobble = 1 + Math.sin(pulse * 7) * 0.055 + mutationCount * 0.004 + player.mutationPulse * 0.18 + playerHurt * 0.12;
    const r = player.radius * wobble;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.shadowBlur = (28 + mutationCount * 3) * quality.shadowScale;
    ctx.shadowColor = player.electric ? "#8fffd3" : "#ff285e";

    const tentacleCount = player.tentacles * 3 + (player.evolution === "electricTentacles" ? 6 : 0);
    const activeTentacles = Math.min(tentacleCount, Math.max(1, player.tentacles + (player.evolution === "electricTentacles" ? 2 : 0)));
    const reachRange = tentacleRange();
    const tentacleTargets = player.tentacles ? sortedEnemiesInRange(reachRange, activeTentacles) : [];
    for (let i = 0; i < tentacleCount; i++) {
      const restAngle = (i / Math.max(1, tentacleCount)) * TAU;
      let target = null;
      let bestAngleGap = 0.78;
      for (const candidate of tentacleTargets) {
        const candidateAngle = Math.atan2(candidate.y - player.y, candidate.x - player.x);
        const gap = Math.abs(angleDelta(restAngle, candidateAngle));
        if (gap < bestAngleGap) {
          bestAngleGap = gap;
          target = candidate;
        }
      }
      const baseAngle = target ? Math.atan2(target.y - player.y, target.x - player.x) : restAngle;
      const a = baseAngle + Math.sin(pulse * 3.1 + i) * (target ? 0.1 : 0.45);
      const targetDistance = target ? Math.hypot(target.x - player.x, target.y - player.y) - target.radius * 0.45 : 0;
      const len = target ? clamp(targetDistance, r * 1.05, reachRange) : r * (1.25 + player.tentacles * 0.18 + Math.sin(pulse * 4 + i) * 0.22);
      const endX = Math.cos(a) * len;
      const endY = Math.sin(a) * len;
      const bend = target ? Math.sin(pulse * 5 + i) * 0.34 : 0.9;
      ctx.strokeStyle = player.electric && i % 2 ? "#8fffd3" : "#c01743";
      ctx.lineWidth = 5 + player.tentacles * 1.7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.quadraticCurveTo(Math.cos(a + bend) * len * 0.5, Math.sin(a + bend) * len * 0.5, endX, endY);
      ctx.stroke();
      perf.drawCalls++;
      if (target) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = player.electric && i % 2 ? "#8fffd3" : "#ff416d";
        ctx.beginPath();
        ctx.arc(endX, endY, Math.max(3, ctx.lineWidth * 0.45), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    for (let i = 0; i < 9 + mutationCount + player.splitting * 4; i++) {
      const a = (i / (9 + mutationCount)) * TAU;
      const br = r * (0.34 + ((i * 17) % 41) / 100);
      const spread = 0.31 + player.splitting * 0.025;
      const x = Math.cos(a + Math.sin(pulse * 2 + i)) * r * spread;
      const y = Math.sin(a + Math.cos(pulse * 2 + i)) * r * spread;
      ctx.fillStyle = playerHurt > 0 ? "#ffedf0" : i % 3 === 0 ? "#711020" : i % 3 === 1 ? "#bb173e" : "#ec4768";
      ctx.beginPath();
      ctx.ellipse(x, y, br, br * (0.72 + ((i * 13) % 29) / 100), a + pulse, 0, TAU);
      ctx.fill();
    }

    if (player.shell || player.evolution === "immortalMass") {
      const plates = 8 + player.shell * 5;
      ctx.strokeStyle = "#ffd3dc";
      ctx.lineWidth = 2 + player.shell * 0.8;
      ctx.globalAlpha = 0.72;
      for (let i = 0; i < plates; i++) {
        const a = (i / plates) * TAU + pulse * 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.68 + (i % Math.max(1, player.shell + 1)) * 0.07), a, a + 0.32);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (player.acid || player.spores || player.evolution === "toxicHive") {
      ctx.fillStyle = "#caff55";
      const sacs = player.acid * 3 + player.spores * 4 + (player.evolution === "toxicHive" ? 8 : 0);
      for (let i = 0; i < sacs; i++) {
        const a = (i / Math.max(1, sacs)) * TAU + pulse;
        const rr = r * (0.62 + (i % 3) * 0.13);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 4 + player.spores + Math.sin(pulse * 5 + i) * 2, 0, TAU);
        ctx.fill();
      }
    }

    if (player.electric) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#8fffd3";
      ctx.lineWidth = 1.5 + player.electric;
      for (let i = 0; i < player.electric * 3; i++) {
        const a = (i / (player.electric * 3)) * TAU + pulse * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.9 + i * 0.05), a, a + 0.18 + Math.sin(pulse * 9 + i) * 0.08);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const eyes = 1 + player.eyes * 3 + (player.evolution === "swarmOrganism" ? 8 : 0);
    for (let i = 0; i < eyes; i++) {
      const a = (i / eyes) * TAU + Math.sin(pulse + i) * 0.5;
      const ex = Math.cos(a) * r * 0.35;
      const ey = Math.sin(a) * r * 0.35;
      ctx.fillStyle = "#ffe5ea";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 7, 4.8, a, 0, TAU);
      ctx.fill();
      ctx.fillStyle = player.electric ? "#8fffd3" : "#050608";
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * 2, ey + Math.sin(a) * 2, 2.7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemies() {
    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
      const enemy = enemies[enemyIndex];
      if (isOutsideRect(enemy, viewRect, enemy.radius * 2)) continue;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.shadowBlur = (enemy.hit ? 22 : 12) * quality.shadowScale;
      ctx.shadowColor = enemy.color;
      ctx.fillStyle = enemy.hit || (enemy.components && enemy.components.render && enemy.components.render.flash > 0) ? "#ffffff" : enemy.color;
      const spikes = enemy.kind === "parasite" ? 3 : enemy.kind === "giant" || enemy.kind === "phage" ? 12 : enemy.kind === "tutorial" ? 5 : 7;
      const hitScale = 1 + (enemy.pulse || 0) * 0.28;
      ctx.beginPath();
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * TAU + pulse * 0.7;
        const rr = enemy.radius * hitScale * (0.78 + Math.sin(pulse * 5 + i) * 0.18);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      perf.drawCalls++;
      if (enemy.kind === "phage") {
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = "#d8f0ff";
        ctx.lineWidth = 4;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + pulse * 0.35;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * enemy.radius * 0.45, Math.sin(a) * enemy.radius * 0.45);
          ctx.lineTo(Math.cos(a) * enemy.radius * 1.45, Math.sin(a) * enemy.radius * 1.45);
          ctx.stroke();
          perf.drawCalls++;
        }
        ctx.globalAlpha = 1;
      }
      if (enemy.hit > 0) {
        ctx.globalAlpha = enemy.hit * 3.5;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * hitScale * 1.35, 0, TAU);
        ctx.stroke();
        perf.drawCalls++;
        ctx.globalAlpha = 1;
      }
      if (enemy.kind === "toxic" || enemy.kind === "giant") {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = enemy.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * 1.35, 0, TAU);
        ctx.stroke();
        perf.drawCalls++;
      }
      ctx.restore();
      if (enemy.kind === "phage" || enemy.hit > 0 || enemyIndex % perfGuard.hpBarStride === 0) drawEnemyHpBar(enemy);
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemyHpBar(enemy) {
    if (!enemy.components || !enemy.components.render || !enemy.components.render.hpBar || enemy.hp >= enemy.maxHp) return;
    const w = clamp(enemy.radius * 2.15, 24, 160);
    const h = enemy.kind === "phage" ? 8 : 5;
    const x = enemy.x - w / 2;
    const y = enemy.y - enemy.radius - 16;
    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    ctx.save();
    ctx.globalAlpha = enemy.kind === "phage" ? 0.95 : 0.78;
    ctx.fillStyle = "rgba(2, 3, 5, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ratio < 0.3 ? "#ff416d" : enemy.components.collision.attackImmune ? "#d4fff0" : "#8fffd3";
    ctx.fillRect(x, y, w * ratio, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1 / camera.scale;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (isOutsideRect(p, viewRect, 220)) continue;
      if (p.trail && p.trail.length) {
        ctx.lineCap = "round";
        for (let i = 0; i < p.trail.length - 1; i++) {
          const a = p.trail[i];
          const b = p.trail[i + 1];
          if (a.life <= 0 || b.life <= 0) continue;
          ctx.globalAlpha = clamp(a.life, 0, 1) * 0.32;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.radius * (1 - i / p.trail.length);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          perf.drawCalls++;
        }
      }
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.shadowBlur = 18 * quality.shadowScale;
      ctx.shadowColor = p.color;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.radius * 0.75;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
      ctx.stroke();
      perf.drawCalls++;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TAU);
      ctx.fill();
      perf.drawCalls++;
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      if ((p.kind === "splash" || p.kind === "absorb" || p.kind === "electricArc") && isOutsideRect(p, viewRect, 80)) continue;
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      if (p.kind === "text") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = p.color;
        ctx.font = "900 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
        perf.drawCalls++;
        ctx.globalCompositeOperation = "lighter";
        continue;
      }
      if (p.kind === "electricArc") {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = p.color;
        ctx.lineWidth = (2.2 + p.radius * 0.18) / camera.scale;
        ctx.shadowBlur = 18 * quality.shadowScale;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const steps = 5;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const nx = p.x + (p.x2 - p.x) * t;
          const ny = p.y + (p.y2 - p.y) * t;
          const jitter = Math.sin(pulse * 37 + i * 9 + p.radius) * 16 * (1 - Math.abs(0.5 - t));
          const a = Math.atan2(p.y2 - p.y, p.x2 - p.x) + Math.PI / 2;
          ctx.lineTo(nx + Math.cos(a) * jitter, ny + Math.sin(a) * jitter);
        }
        ctx.stroke();
        perf.drawCalls++;
        ctx.shadowBlur = 0;
        continue;
      }
      if (p.kind === "toxicZone") {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.16;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.fill();
        perf.drawCalls++;
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 / camera.scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.stroke();
        perf.drawCalls++;
        continue;
      }
      if (p.kind === "massWave") {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha * 0.72;
        ctx.lineWidth = (7 + player.shell * 0.7) / camera.scale;
        ctx.shadowBlur = 24 * quality.shadowScale;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.stroke();
        perf.drawCalls++;
        ctx.globalAlpha = alpha * 0.22;
        ctx.lineWidth = 20 / camera.scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.94, 0, TAU);
        ctx.stroke();
        perf.drawCalls++;
        ctx.shadowBlur = 0;
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (p.kind === "absorb" ? 1 : alpha), 0, TAU);
      ctx.fill();
      perf.drawCalls++;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  function updateHud() {
    hpBar.style.transform = `scaleX(${clamp(player.hp / player.maxHp, 0, 1)})`;
    xpBar.style.transform = `scaleX(${clamp(player.xp / player.nextXp, 0, 1)})`;
    levelText.textContent = `${player.level}단계`;
    const m = Math.floor(runTime / 60).toString().padStart(2, "0");
    const s = Math.floor(runTime % 60).toString().padStart(2, "0");
    timeText.textContent = `${m}:${s}`;
    updateStatPanel();
  }

  function updateStatPanel() {
    if (!statPanel) return;
    const signature = [
      Math.floor(runTime * 2),
      player.level,
      Math.round(player.hp),
      Math.round(player.maxHp),
      Math.round(player.attackSpeed * 100),
      Math.round(player.armor * 100),
      Math.round(player.regen * 10),
      Math.round(xpMultiplier() * 100),
      player.tentacles,
      player.acid,
      player.electric,
      player.spores,
      player.eyes,
      player.shell,
      player.splitting,
      player.absorption,
      player.slime,
      player.dash,
      player.accelStack,
      player.evolution,
    ].join("|");
    if (signature === lastStatsSignature) return;
    lastStatsSignature = signature;

    const mutationChips = [
      ["TEN", player.tentacles],
      ["ACD", player.acid],
      ["ELC", player.electric],
      ["SPO", player.spores],
      ["EYE", player.eyes],
      ["SHL", player.shell],
      ["SPL", player.splitting],
      ["ABS", player.absorption],
      ["SLM", player.slime],
      ["DSH", player.dash],
      ["SPD", player.accelStack],
    ]
      .filter(([, value]) => value > 0)
      .map(([label, value]) => `<span class="stat-chip mutation"><b>${label}</b>${value}</span>`)
      .join("");

    statPanel.innerHTML = `
      <span class="stat-chip"><b>HP</b>${Math.round(player.hp)}/${Math.round(player.maxHp)}</span>
      <span class="stat-chip"><b>AS</b>${player.attackSpeed.toFixed(2)}</span>
      <span class="stat-chip"><b>ARM</b>${Math.round(player.armor * 100)}%</span>
      <span class="stat-chip"><b>REG</b>${player.regen.toFixed(1)}/s</span>
      <span class="stat-chip"><b>XP</b>x${xpMultiplier().toFixed(2)}</span>
      ${player.evolution ? `<span class="stat-chip"><b>EVO</b>${player.evolutionName}</span>` : ""}
      ${mutationChips || `<span class="stat-chip mutation"><b>MUT</b>none</span>`}
    `;
  }

  function endRun() {
    state = "over";
    mutationPanel.classList.add("hidden");
    pausePanel.classList.add("hidden");
    gameOverPanel.classList.remove("hidden");
    overTitle.textContent = player.evolutionName ? `${player.evolutionName} 붕괴.` : "생체질량이 정지했다.";
    overStats.textContent = `${timeText.textContent} 생존. ${player.level}단계 도달. ${player.kills}개체 흡수.`;
  }

  function winRun() {
    state = "over";
    mutationPanel.classList.add("hidden");
    pausePanel.classList.add("hidden");
    gameOverPanel.classList.remove("hidden");
    overTitle.textContent = "박테리오파지 붕괴.";
    overStats.textContent = `${timeText.textContent} 생존. ${player.evolutionName || "원시 생체"}가 면역 장벽을 찢고 증식을 끝냈습니다.`;
    screenPulse = 1;
    shake = Math.max(shake, 28);
    spawnParticle(player.x, player.y, "#d8f0ff", 140, 2.2, 1.6);
  }

  function pauseRun() {
    if (state !== "play") return;
    state = "paused";
    pausePanel.classList.remove("hidden");
    last = performance.now();
  }

  function resumeRun() {
    if (state !== "paused") return;
    state = "play";
    pausePanel.classList.add("hidden");
    last = performance.now();
  }

  function frame(now) {
    const rawDt = last ? (now - last) / 1000 : 1 / 60;
    if (rawDt > 0) perf.fps += (1 / rawDt - perf.fps) * 0.08;
    const dt = Math.min(0.033, rawDt || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space" && state === "over") startRun();
    else if (event.code === "Space" && state === "paused") resumeRun();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  canvas.addEventListener("pointerdown", (event) => {
    mobilePointer = screenToWorld(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (mobilePointer) {
      Object.assign(mobilePointer, screenToWorld(event.clientX, event.clientY));
    }
  });
  canvas.addEventListener("pointerup", () => {
    mobilePointer = null;
  });
  startButton.addEventListener("click", startRun);
  restartButton.addEventListener("click", startRun);
  resumeButton.addEventListener("click", resumeRun);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pauseRun();
  });
  window.addEventListener("blur", pauseRun);

  resize();
  updateHud();
  requestAnimationFrame(frame);
})();
