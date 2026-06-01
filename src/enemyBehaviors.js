(() => {
const { ENEMY_BEHAVIORS } = globalThis.CellConstants;

const enemyBehaviorRegistry = {
  [ENEMY_BEHAVIORS.CHASER]: {
    updateAim(enemy, player) {
      enemy.components.movement.targetX = player.x;
      enemy.components.movement.targetY = player.y;
    },
  },
  [ENEMY_BEHAVIORS.DASHER]: {
    updateAim(enemy, player, dt) {
      const aim = enemy.components.movement;
      aim.lockTimer -= dt;
      const closeToLock = (enemy.x - aim.targetX) ** 2 + (enemy.y - aim.targetY) ** 2 < 24 ** 2;
      if (aim.lockTimer <= 0 || closeToLock) {
        aim.targetX = player.x;
        aim.targetY = player.y;
        aim.lockTimer = 0.85;
      }
    },
  },
  [ENEMY_BEHAVIORS.RANGED]: {
    updateAim(enemy, player) {
      enemy.components.movement.targetX = player.x;
      enemy.components.movement.targetY = player.y;
    },
  },
  [ENEMY_BEHAVIORS.EXPLODER]: {
    updateAim(enemy, player) {
      enemy.components.movement.targetX = player.x;
      enemy.components.movement.targetY = player.y;
    },
  },
  [ENEMY_BEHAVIORS.SUMMONER]: {
    updateAim(enemy, player) {
      enemy.components.movement.targetX = player.x;
      enemy.components.movement.targetY = player.y;
    },
  },
  [ENEMY_BEHAVIORS.SUPPORT]: {
    updateAim(enemy, player) {
      enemy.components.movement.targetX = player.x;
      enemy.components.movement.targetY = player.y;
    },
  },
};

function applyEnemyBehavior(enemy, player, dt) {
  const behavior = enemyBehaviorRegistry[enemy.behavior] || enemyBehaviorRegistry[ENEMY_BEHAVIORS.CHASER];
  behavior.updateAim(enemy, player, dt);
}

globalThis.CellEnemyBehaviors = {
  enemyBehaviorRegistry,
  applyEnemyBehavior,
};
})();
