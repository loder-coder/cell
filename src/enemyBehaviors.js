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
    updateAim(enemy) {
      const aim = enemy.components.movement;
      aim.targetX = enemy.x + (aim.fixedDirX || 0) * 1200;
      aim.targetY = enemy.y + (aim.fixedDirY || 0) * 1200;
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
