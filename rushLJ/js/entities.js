/**
 * 实体工厂 + 血量/伤害模型。
 * 所有刚体的玩法属性直接挂在 body 上（gameType / hp / material ...），
 * 渲染与主循环都靠这些字段做判定，不额外维护 ID 映射表。
 */
const Entities = (function () {
  const { Bodies } = Matter;

  const MATERIALS = {
    wood: {
      hp: 45, density: 0.0022, restitution: 0.12, friction: 0.65,
      fill: '#C68B4E', edge: '#8A5A2B', grain: '#A9723C'
    },
    stone: {
      hp: 88, density: 0.0055, restitution: 0.08, friction: 0.85,
      fill: '#9CA3AF', edge: '#5B6270', grain: '#7C838F'
    }
  };

  const PIG = {
    radius: 18, hp: 25, density: 0.0016,
    restitution: 0.15, friction: 0.7, frictionAir: 0.003
  };

  const BIRD = {
    radius: 19, density: 0.005,
    restitution: 0.45, friction: 0.5, frictionAir: 0.0008
  };

  // 主动技能（发射后点按触发）：贝拉=投掷爆裂锤，嘉然=一分为三横向扫射，乃琳=飞矛直线加速
  const BIRD_SKILL = { bella: 'hammer', jiaran: 'split', nailin: 'spear' };

  // 贝拉的投掷锤：碰到任何东西立刻爆炸，比蛋更大更沉，砸感更足
  const HAMMER = { radius: 10, density: 0.005 };

  // 我方角色出场顺序（外观轮换，物理参数共用 BIRD）
  const BIRD_SKINS = ['bella', 'jiaran', 'nailin'];

  function createBlock(def) {
    const m = MATERIALS[def.material] || MATERIALS.wood;
    const body = Bodies.rectangle(def.x, def.y, def.w, def.h, {
      density: m.density,
      restitution: m.restitution,
      friction: m.friction,
      frictionStatic: 1,
      frictionAir: 0.006
    });
    body.gameType = 'block';
    body.material = def.material in MATERIALS ? def.material : 'wood';
    body.maxHp = m.hp;
    body.hp = m.hp;
    body.w = def.w;
    body.h = def.h;
    body.hitFlash = 0;
    body.dead = false;
    return body;
  }

  function createPig(x, y) {
    const body = Bodies.circle(x, y, PIG.radius, {
      density: PIG.density,
      restitution: PIG.restitution,
      friction: PIG.friction,
      frictionStatic: 0.8,
      frictionAir: PIG.frictionAir
    });
    body.gameType = 'pig';
    body.maxHp = PIG.hp;
    body.hp = PIG.hp;
    body.hitFlash = 0;
    body.dead = false;
    return body;
  }

  function createHammer(x, y) {
    const body = Bodies.circle(x, y, HAMMER.radius, {
      density: HAMMER.density,
      restitution: 0.15,
      friction: 0.5,
      frictionAir: 0.004
    });
    body.gameType = 'hammer';
    body.hitFlash = 0;
    body.dead = false;
    return body;
  }

  function createBird(x, y, skin) {
    const body = Bodies.circle(x, y, BIRD.radius, {
      density: BIRD.density,
      restitution: BIRD.restitution,
      friction: BIRD.friction,
      frictionStatic: 0.6,
      frictionAir: BIRD.frictionAir
    });
    body.gameType = 'bird';
    body.skin = BIRD_SKINS.indexOf(skin) >= 0 ? skin : BIRD_SKINS[0];
    body.skillUsed = false;
    body.hitFlash = 0;
    body.dead = false;
    return body;
  }

  /**
   * 扣血。返回 true 表示这一击把它打死了。
   * 小鸟没有血量，永远返回 false；锤子走独立的爆炸结算，不走这里。
   */
  function damage(body, amount) {
    if (!body || body.dead || body.gameType === 'bird' || body.gameType === 'hammer') return false;
    body.hp -= amount;
    body.hitFlash = 1;
    if (body.hp <= 0) {
      body.dead = true;
      return true;
    }
    return false;
  }

  function decayFlash(body, rate) {
    if (body.hitFlash > 0) body.hitFlash = Math.max(0, body.hitFlash - rate);
  }

  return { MATERIALS, PIG, BIRD, BIRD_SKINS, BIRD_SKILL, HAMMER, createBlock, createPig, createHammer, createBird, damage, decayFlash };
})();