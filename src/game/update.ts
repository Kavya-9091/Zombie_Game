import type { GameState, Zombie, Bullet, Particle, Pickup, FloatingText, Npc, Vehicle, WorldEvent } from './types';
import { WEAPONS } from './types';
import {
  WORLD_SIZE,
  spawnZombie,
  getZombieScoreValue,
  getZombieCoinChance,
  getZombieCoinAmount,
  dist,
  normalize,
} from './engine';

export function startWave(state: GameState): void {
  state.wave++;
  state.zombiesToSpawn = 6 + state.wave * 3;
  state.spawnTimer = 0;
  state.betweenWaves = false;
}

export function updateGame(state: GameState, dt: number, onShoot?: (weaponKey: string) => void, onHit?: () => void): void {
  if (state.phase !== 'playing') return;

  state.time += dt;
  const dts = dt / 16.67; // scale to 60fps units

  updatePlayer(state, dts);
  updateShooting(state, dt, onShoot);
  updateCitySimulation(state, dt, dts);
  updateNpcs(state, dt, dts);
  updateZombies(state, dts, onHit);
  updateBullets(state, dts);
  updateParticles(state, dts);
  updateMuzzleFlashes(state, dts);
  updatePickups(state, dts);
  updateFloatingTexts(state, dts);
  updateWaveLogic(state, dt);
  updateCamera(state);

  if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dts * 0.8);
  if (state.streakTimer > 0) {
    state.streakTimer -= dt;
    if (state.streakTimer <= 0) state.killStreak = 0;
  }

  // Regen
  const regenLevel = state.upgradeLevels['regen'] ?? 0;
  if (regenLevel > 0 && state.player.hp < state.player.maxHp) {
    state.player.regenAccum += dt;
    const interval = 2000 / regenLevel;
    if (state.player.regenAccum >= interval) {
      state.player.regenAccum = 0;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
    }
  }

  if (state.player.hp <= 0) {
    state.phase = 'gameover';
  }
}

function updatePlayer(state: GameState, dts: number): void {
  const p = state.player;
  let dx = 0;
  let dy = 0;
  if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
  if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
  if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
  if (state.keys['d'] || state.keys['arrowright']) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const n = normalize({ x: dx, y: dy });
    dx = n.x;
    dy = n.y;
  }

  const speedLevel = state.upgradeLevels['speed'] ?? 0;
  const rubblePenalty = isInRubble(state, p.x, p.y, p.radius) ? 0.7 : 1;
  const speed = p.speed * (1 + speedLevel * 0.15) * rubblePenalty;
  p.vx = dx * speed;
  p.vy = dy * speed;
  moveWithObstacleCollision(state, p, p.vx * dts, p.vy * dts);
  p.x = Math.max(p.radius, Math.min(WORLD_SIZE - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(WORLD_SIZE - p.radius, p.y));

  if (p.invuln > 0) p.invuln -= dts * 16.67;
}

function updateShooting(state: GameState, dt: number, onShoot?: (weaponKey: string) => void): void {
  const p = state.player;
  // Convert screen mouse coords to world coords
  const mouseWorldX = (state.mouse.x - state.canvasW / 2) / state.cameraZoom + state.player.x;
  const mouseWorldY = (state.mouse.y - state.canvasH / 2) / state.cameraZoom + state.player.y;
  p.angle = Math.atan2(mouseWorldY - state.player.y, mouseWorldX - state.player.x);

  if (p.fireCooldown > 0) p.fireCooldown -= dt;

  const weapon = WEAPONS[state.currentWeapon];
  if (!weapon) return;

  const fireRateLevel = state.upgradeLevels['firerate'] ?? 0;
  const effectiveFireRate = weapon.fireRate / (1 + fireRateLevel * 0.12);

  if (state.mouse.down && p.fireCooldown <= 0) {
    const ammo = state.ammo[state.currentWeapon];
    if (ammo > 0) {
      fireWeapon(state, weapon);
      createNoise(state, p.x, p.y, weapon.name === 'Shotgun' ? 620 : weapon.name === 'Rifle' ? 560 : 420);
      onShoot?.(state.currentWeapon);
      if (state.currentWeapon === 'shotgun' || state.currentWeapon === 'minigun') {
        state.screenShake = Math.min(14, state.screenShake + (state.currentWeapon === 'shotgun' ? 6 : 3.5));
      }
      if (state.currentWeapon !== 'pistol') {
        state.ammo[state.currentWeapon]--;
      }
      p.fireCooldown = effectiveFireRate;
    } else if (state.currentWeapon !== 'pistol') {
      // Out of ammo, switch to pistol
      state.currentWeapon = 'pistol';
      p.fireCooldown = 200;
    }
  }
}

function fireWeapon(state: GameState, weapon: typeof WEAPONS[string]): void {
  const p = state.player;
  const damageLevel = state.upgradeLevels['damage'] ?? 0;
  const damage = weapon.damage * (1 + damageLevel * 0.2);

  for (let i = 0; i < weapon.pellets; i++) {
    const spreadAngle = (Math.random() - 0.5) * weapon.spread * 2;
    const angle = p.angle + spreadAngle;
    state.bullets.push({
      x: p.x + Math.cos(p.angle) * p.radius,
      y: p.y + Math.sin(p.angle) * p.radius,
      vx: Math.cos(angle) * weapon.bulletSpeed,
      vy: Math.sin(angle) * weapon.bulletSpeed,
      damage,
      life: 80,
      pierce: weapon.pierce,
      radius: weapon.bulletRadius,
      source: 'player',
      color: weapon.color,
    });
  }

  state.muzzleFlashes.push({
    x: p.x + Math.cos(p.angle) * (p.radius + 42),
    y: p.y + Math.sin(p.angle) * (p.radius + 42),
    angle: p.angle,
    life: 1 + Math.floor(Math.random() * 2),
    maxLife: 2,
    size: weapon.name === 'Shotgun' ? 34 : weapon.name === 'Minigun' ? 24 : 20,
    color: weapon.color,
  });

  // Muzzle flash particles
  for (let i = 0; i < 4; i++) {
    state.particles.push({
      x: p.x + Math.cos(p.angle) * p.radius,
      y: p.y + Math.sin(p.angle) * p.radius,
      vx: Math.cos(p.angle) * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
      vy: Math.sin(p.angle) * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
      life: 8,
      maxLife: 8,
      color: weapon.color,
      size: 3 + Math.random() * 2,
    });
  }
}

function updateZombies(state: GameState, dts: number, onHit?: () => void): void {
  const p = state.player;
  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const z = state.zombies[i];
    const prey = findZombiePrey(state, z);
    if (prey) {
      z.targetX = prey.x;
      z.targetY = prey.y;
      z.alerted = true;
    }

    const dx = z.targetX - z.x;
    const dy = z.targetY - z.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const weatherPenalty = state.simulation.weather === 'storm' ? 0.9 : 1;
    const rubblePenalty = isInRubble(state, z.x, z.y, z.radius) ? 0.7 : 1;
    const speed = (z.slowTimer > 0 ? z.speed * 0.4 : z.speed) * weatherPenalty * rubblePenalty;
    z.vx = (dx / d) * speed;
    z.vy = (dy / d) * speed;
    moveWithObstacleCollision(state, z, z.vx * dts, z.vy * dts);

    if (z.hitFlash > 0) z.hitFlash -= dts;
    if (z.slowTimer > 0) z.slowTimer -= dts * 16.67;
    if (z.attackCooldown > 0) z.attackCooldown -= dts * 16.67;

    if (z.alerted) {
      alertNearbyZombies(state, z.x, z.y, 130 + z.hearing * 0.25, z.targetX, z.targetY);
    }

    // Attack player
    const playerDist = dist(z, p);
    if (playerDist < z.radius + p.radius && z.attackCooldown <= 0 && p.invuln <= 0) {
      p.hp -= z.damage;
      p.invuln = 600;
      z.attackCooldown = 800;
      state.screenShake = Math.min(20, state.screenShake + 8);
      state.killStreak = 0;
      onHit?.();
      if (Math.random() < 0.16) {
        state.simulation.radio.unshift({ text: 'Vitals warning: bite exposure detected.', life: 360, source: 'dispatch' });
      }

      // Blood particles on player
      for (let j = 0; j < 8; j++) {
        state.particles.push({
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          life: 20,
          maxLife: 20,
          color: '#dc2626',
          size: 2 + Math.random() * 3,
        });
      }
    }

    for (let n = state.npcs.length - 1; n >= 0; n--) {
      const npc = state.npcs[n];
      if (dist(z, npc) < z.radius + npc.radius && z.attackCooldown <= 0) {
        npc.hp -= z.damage;
        npc.fear = Math.min(100, npc.fear + 18);
        npc.infection = npc.infection === 'healthy' ? 'bitten' : npc.infection;
        npc.infectionTimer += 900;
        z.attackCooldown = 800;
        if (npc.hp <= 0 || npc.infection === 'turning') {
          turnNpcIntoZombie(state, npc, n);
        }
      }
    }

    // Zombie-zombie separation (soft)
    for (let j = i - 1; j >= 0; j--) {
      const z2 = state.zombies[j];
      const sdx = z.x - z2.x;
      const sdy = z.y - z2.y;
      const sd = Math.sqrt(sdx * sdx + sdy * sdy);
      const minDist = z.radius + z2.radius;
      if (sd < minDist && sd > 0) {
        const push = (minDist - sd) / 2;
        const nx = sdx / sd;
        const ny = sdy / sd;
        z.x += nx * push * 0.5;
        z.y += ny * push * 0.5;
        z2.x -= nx * push * 0.5;
        z2.y -= ny * push * 0.5;
      }
    }
  }
}

function updateCitySimulation(state: GameState, dt: number, dts: number): void {
  const sim = state.simulation;
  sim.timeOfDay = (sim.timeOfDay + dt / 60000) % 24;
  sim.outbreakLevel = Math.min(1, (state.wave * 0.08) + (state.kills * 0.002) + (state.zombies.length * 0.006));
  sim.powerGrid = Math.max(0.25, sim.powerGrid - sim.outbreakLevel * dt * 0.000002);
  sim.smoke = Math.max(0, Math.min(1, sim.smoke + (sim.fire * 0.001 - 0.0004) * dts));
  sim.fire = Math.max(0, Math.min(1, sim.fire - 0.0002 * dts));

  sim.weatherTimer -= dt;
  if (sim.weatherTimer <= 0) {
    const weather = ['clear', 'rain', 'storm', 'fog', 'wind'] as const;
    sim.weather = weather[Math.floor(Math.random() * weather.length)];
    sim.weatherTimer = 35000 + Math.random() * 45000;
  }

  sim.events.length = 0;
  sim.radio.length = 0;
}

function updateNpcs(state: GameState, dt: number, dts: number): void {
  for (let i = state.npcs.length - 1; i >= 0; i--) {
    const npc = state.npcs[i];
    npc.decisionTimer -= dt;
    npc.radioCooldown -= dt;
    updateInfection(state, npc, i, dt);
    if (!state.npcs[i]) continue;

    const threat = nearestZombie(state, npc);
    if (npc.decisionTimer <= 0) {
      decideNpcGoal(state, npc, threat);
      npc.decisionTimer = 850 + Math.random() * 500;
    }

    if (threat && dist(npc, threat) < npc.vision) {
      npc.memoryX = threat.x;
      npc.memoryY = threat.y;
      npc.fear = Math.min(100, npc.fear + 0.05 * dts);
      if (npc.weapon !== 'none' && npc.ammo > 0 && (npc.role !== 'civilian' || npc.courage > npc.fear)) {
        shootNpcWeapon(state, npc, threat);
      }
    }

    moveNpc(state, npc, threat, dts);
  }
}

function updateVehicles(state: GameState, dt: number, dts: number): void {
  for (const v of state.vehicles) {
    if (v.fuel <= 0 || v.damage >= 100) continue;
    const dx = v.targetX - v.x;
    const dy = v.targetY - v.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (len < 30) {
      v.targetX = 160 + Math.random() * (WORLD_SIZE - 320);
      v.targetY = 160 + Math.random() * (WORLD_SIZE - 320);
    }
    const handling = state.simulation.weather === 'rain' || state.simulation.weather === 'storm' ? 0.82 : 1;
    const speed = (v.kind === 'helicopter' ? 2.4 : v.kind === 'militaryTruck' ? 1.45 : 1.8) * handling;
    v.vx = (dx / len) * speed;
    v.vy = (dy / len) * speed;
    v.x += v.vx * dts;
    v.y += v.vy * dts;
    v.fuel -= dt * 0.00012;
    if (v.siren && Math.random() < 0.002) createNoise(state, v.x, v.y, 520);

    for (const z of state.zombies) {
      if (dist(v, z) < v.radius + z.radius) {
        z.hp -= v.kind === 'militaryTruck' ? 55 : 30;
        v.damage += 0.8;
      }
    }
  }
}

function decideNpcGoal(state: GameState, npc: Npc, threat?: Zombie): void {
  if (threat && dist(npc, threat) < npc.vision) {
    if (npc.role === 'police' || npc.role === 'swat' || npc.role === 'military') npc.currentGoal = npc.ammo > 0 ? 'fight' : 'callBackup';
    else if (npc.personality === 'protector' && npc.courage > npc.fear) npc.currentGoal = 'help';
    else if (npc.personality === 'looter' && state.simulation.outbreakLevel > 0.25) npc.currentGoal = 'loot';
    else npc.currentGoal = npc.fear > 65 ? 'run' : 'hide';
    npc.emotion = npc.currentGoal === 'fight' || npc.currentGoal === 'help' ? 'brave' : 'afraid';
    if (npc.role !== 'civilian' && npc.radioCooldown <= 0) {
      const lines = ['Officer down! Need backup!', 'Multiple infected, protect civilians!', 'Stay behind me!', 'Falling back, we are overwhelmed!'];
      state.simulation.radio.unshift({ text: `${npc.role.toUpperCase()}: ${lines[Math.floor(Math.random() * lines.length)]}`, life: 420, source: npc.role });
      npc.radioCooldown = 5000;
    }
    return;
  }

  npc.currentGoal = npc.role === 'civilian' ? 'travel' : 'patrol';
  npc.emotion = 'calm';
}

function moveNpc(state: GameState, npc: Npc, threat: Zombie | undefined, dts: number): void {
  let tx = npc.targetX;
  let ty = npc.targetY;
  if (threat && (npc.currentGoal === 'run' || npc.currentGoal === 'hide')) {
    tx = npc.x + (npc.x - threat.x);
    ty = npc.y + (npc.y - threat.y);
  } else if (threat && (npc.currentGoal === 'fight' || npc.currentGoal === 'help')) {
    tx = threat.x;
    ty = threat.y;
  }
  const dx = tx - npc.x;
  const dy = ty - npc.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  if (len < 28) {
    npc.targetX = 140 + Math.random() * (WORLD_SIZE - 280);
    npc.targetY = 140 + Math.random() * (WORLD_SIZE - 280);
  }
  const panic = npc.currentGoal === 'run' ? 1.55 : 1;
  const speed = (npc.role === 'civilian' ? 1.05 : 1.35) * panic * (npc.stamina / 100);
  npc.vx = (dx / len) * speed;
  npc.vy = (dy / len) * speed;
  npc.x = Math.max(npc.radius, Math.min(WORLD_SIZE - npc.radius, npc.x + npc.vx * dts));
  npc.y = Math.max(npc.radius, Math.min(WORLD_SIZE - npc.radius, npc.y + npc.vy * dts));
  npc.stamina = Math.max(25, Math.min(100, npc.stamina + (npc.currentGoal === 'run' ? -0.08 : 0.03) * dts));
}

function shootNpcWeapon(state: GameState, npc: Npc, z: Zombie): void {
  if (npc.radioCooldown > 0 && npc.role === 'civilian') return;
  if (npc.radioCooldown > 0 && npc.role !== 'civilian') return;
  const angle = Math.atan2(z.y - npc.y, z.x - npc.x) + (Math.random() - 0.5) * (npc.role === 'military' || npc.role === 'swat' ? 0.04 : 0.09);
  const damage = npc.weapon === 'rifle' ? 34 : npc.weapon === 'shotgun' ? 24 : 19;
  const pellets = npc.weapon === 'shotgun' ? 5 : 1;
  for (let i = 0; i < pellets; i++) {
    const pelletAngle = angle + (Math.random() - 0.5) * 0.18;
    state.bullets.push({
      x: npc.x + Math.cos(angle) * npc.radius,
      y: npc.y + Math.sin(angle) * npc.radius,
      vx: Math.cos(pelletAngle) * (npc.weapon === 'rifle' ? 15 : npc.weapon === 'shotgun' ? 10 : 12),
      vy: Math.sin(pelletAngle) * (npc.weapon === 'rifle' ? 15 : npc.weapon === 'shotgun' ? 10 : 12),
      damage,
      life: npc.weapon === 'rifle' ? 62 : 48,
      pierce: npc.weapon === 'rifle' ? 1 : 0,
      radius: npc.weapon === 'rifle' ? 3.5 : 3,
      source: 'ally',
      color: npc.role === 'military' || npc.role === 'swat' ? '#93c5fd' : '#fbbf24',
    });
  }
  for (let i = 0; i < 3; i++) {
    state.particles.push({
      x: npc.x + Math.cos(angle) * npc.radius,
      y: npc.y + Math.sin(angle) * npc.radius,
      vx: Math.cos(angle) * (2 + Math.random() * 2),
      vy: Math.sin(angle) * (2 + Math.random() * 2),
      life: 7,
      maxLife: 7,
      color: '#facc15',
      size: 2 + Math.random() * 2,
    });
  }
  npc.ammo--;
  npc.radioCooldown = npc.role === 'civilian' ? 850 : npc.weapon === 'rifle' ? 180 : 320;
  state.soundEvents.push(npc.weapon === 'rifle' ? 'rifle' : npc.weapon === 'shotgun' ? 'shotgun' : 'pistol');
  createNoise(state, npc.x, npc.y, npc.weapon === 'shotgun' ? 520 : 380);
}

function updateInfection(state: GameState, npc: Npc, index: number, dt: number): void {
  if (npc.infection === 'healthy') return;
  npc.infectionTimer += dt;
  if (npc.infectionTimer > 24000) npc.infection = 'turning';
  else if (npc.infectionTimer > 19000) npc.infection = 'critical';
  else if (npc.infectionTimer > 14000) npc.infection = 'weak';
  else if (npc.infectionTimer > 9000) npc.infection = 'infected';
  else if (npc.infectionTimer > 4500) npc.infection = 'bleeding';
  if (npc.infection === 'turning') turnNpcIntoZombie(state, npc, index);
}

function turnNpcIntoZombie(state: GameState, npc: Npc, index: number): void {
  state.npcs.splice(index, 1);
  const z = spawnZombie(state);
  z.x = npc.x;
  z.y = npc.y;
  z.type = npc.role === 'police' ? 'police' : npc.role === 'military' ? 'military' : 'walker';
  z.targetX = state.player.x;
  z.targetY = state.player.y;
  z.alerted = true;
  state.zombies.push(z);
  state.simulation.radio.unshift({ text: `${npc.name} has turned. Nearby units fall back.`, life: 420, source: 'dispatch' });
}

function nearestZombie(state: GameState, npc: Npc): Zombie | undefined {
  let best: Zombie | undefined;
  let bestD = Infinity;
  for (const z of state.zombies) {
    const d = dist(npc, z);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

function findZombiePrey(state: GameState, z: Zombie): { x: number; y: number } | undefined {
  let prey: { x: number; y: number } | undefined;
  let bestD = dist(z, state.player);
  if (bestD < z.vision || z.alerted) prey = state.player;
  for (const npc of state.npcs) {
    const d = dist(z, npc);
    if (d < bestD && d < z.vision * (state.simulation.weather === 'fog' ? 0.55 : 1)) {
      bestD = d;
      prey = npc;
    }
  }
  return prey;
}

function createNoise(state: GameState, x: number, y: number, radius: number): void {
  alertNearbyZombies(state, x, y, radius, x, y);
}

function alertNearbyZombies(state: GameState, x: number, y: number, radius: number, targetX: number, targetY: number): void {
  for (const z of state.zombies) {
    const hearing = z.hearing * (state.simulation.weather === 'rain' ? 0.7 : 1);
    if (dist(z, { x, y }) < radius + hearing * 0.35) {
      z.alerted = true;
      z.targetX = targetX;
      z.targetY = targetY;
    }
  }
}

function spawnWorldEvent(state: GameState): void {
  const kinds: WorldEvent['kind'][] = ['hospital_overrun', 'checkpoint', 'gas_explosion', 'convoy', 'helicopter_crash'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const event: WorldEvent = {
    id: state.simulation.nextEventId++,
    kind,
    x: 180 + Math.random() * (WORLD_SIZE - 360),
    y: 180 + Math.random() * (WORLD_SIZE - 360),
    timer: 30000,
    severity: 0.4 + Math.random() * 0.6,
  };
  state.simulation.events.push(event);
  state.simulation.radio.unshift({ text: `Dynamic event: ${kind.replace('_', ' ')} reported. Units responding.`, life: 460, source: 'dispatch' });
  if (kind === 'checkpoint' && state.npcs.length < 18) {
    for (let i = 0; i < 2; i++) {
      spawnResponder(state, state.wave > 5 ? 'military' : 'police', event.x, event.y);
    }
  }
}

function spawnResponder(state: GameState, role: Npc['role'], x?: number, y?: number): void {
  const template = state.npcs.find((npc) => npc.role === role) ?? state.npcs.find((npc) => npc.role === 'police') ?? state.npcs[0];
  if (!template) return;
  const npc: Npc = {
    ...template,
    x: (x ?? state.player.x) + (Math.random() - 0.5) * 520,
    y: (y ?? state.player.y) + (Math.random() - 0.5) * 520,
    vx: 0,
    vy: 0,
    hp: role === 'police' ? 110 : 140,
    maxHp: role === 'police' ? 110 : 140,
    role,
    name: `${role}-${state.npcs.length + 1}`,
    fear: role === 'police' ? 18 : 8,
    courage: role === 'police' ? 74 : 90,
    stamina: 100,
    ammo: role === 'police' ? 80 : 150,
    weapon: role === 'police' ? 'pistol' : 'rifle',
    infection: 'healthy',
    infectionTimer: 0,
    currentGoal: 'patrol',
    emotion: 'brave',
    decisionTimer: 120,
    radioCooldown: 0,
  };
  npc.x = Math.max(npc.radius, Math.min(WORLD_SIZE - npc.radius, npc.x));
  npc.y = Math.max(npc.radius, Math.min(WORLD_SIZE - npc.radius, npc.y));
  state.npcs.push(npc);
  state.simulation.radio.unshift({ text: `${role.toUpperCase()} unit entering the area. Engaging infected.`, life: 420, source: role });
}

function updateBullets(state: GameState, dts: number): void {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dts;
    b.y += b.vy * dts;
    b.life -= dts;

    if (b.life <= 0 || b.x < 0 || b.x > WORLD_SIZE || b.y < 0 || b.y > WORLD_SIZE || hitsObstacle(state, b.x, b.y, b.radius)) {
      state.bullets.splice(i, 1);
      continue;
    }

    for (let j = state.zombies.length - 1; j >= 0; j--) {
      const z = state.zombies[j];
      const d = dist(b, z);
      if (d < z.radius + b.radius) {
        z.hp -= b.damage;
        state.soundEvents.push('zombieHit');
        z.hitFlash = 6;
        z.slowTimer = 200;
        const bulletSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
        const knockback = b.source === 'player' ? 8 : 5;
        z.x = Math.max(z.radius, Math.min(state.worldSize - z.radius, z.x + (b.vx / bulletSpeed) * knockback));
        z.y = Math.max(z.radius, Math.min(state.worldSize - z.radius, z.y + (b.vy / bulletSpeed) * knockback));
        addBloodStain(state, b.x, b.y, 16 + Math.random() * 18);

        // Hit particles
        for (let k = 0; k < 18; k++) {
          const backAngle = Math.atan2(-b.vy, -b.vx) + (Math.random() - 0.5) * 1.8;
          const force = 2 + Math.random() * 7;
          state.particles.push({
            x: b.x,
            y: b.y,
            vx: Math.cos(backAngle) * force,
            vy: Math.sin(backAngle) * force,
            life: 18 + Math.random() * 16,
            maxLife: 34,
            color: k % 3 === 0 ? '#ef4444' : '#7a1010',
            size: 2 + Math.random() * 4,
          });
        }

        if (z.hp <= 0) {
          killZombie(state, z, j);
        }

        if (b.pierce > 0) {
          b.pierce--;
        } else {
          state.bullets.splice(i, 1);
          break;
        }
      }
    }
  }
}

function isInRubble(state: GameState, x: number, y: number, radius: number): boolean {
  return state.rubbleZones.some((rubble) => dist({ x, y }, rubble) < rubble.radius + radius * 0.4);
}

function hitsObstacle(state: GameState, x: number, y: number, radius: number): boolean {
  return state.obstacles.some((obstacle) => dist({ x, y }, obstacle) < obstacle.radius + radius);
}

function moveWithObstacleCollision(state: GameState, entity: { x: number; y: number; radius: number }, dx: number, dy: number): void {
  entity.x += dx;
  resolveObstacleCollision(state, entity);
  entity.y += dy;
  resolveObstacleCollision(state, entity);
}

function resolveObstacleCollision(state: GameState, entity: { x: number; y: number; radius: number }): void {
  for (const obstacle of state.obstacles) {
    const dx = entity.x - obstacle.x;
    const dy = entity.y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const minDistance = entity.radius + obstacle.radius;
    if (distance < minDistance) {
      const push = minDistance - distance;
      entity.x += (dx / distance) * push;
      entity.y += (dy / distance) * push;
    }
  }
}

function killZombie(state: GameState, z: Zombie, index: number): void {
  state.zombies.splice(index, 1);
  addBloodStain(state, z.x, z.y, z.radius * (1.6 + Math.random() * 0.9));
  state.kills++;
  state.killStreak++;
  state.streakTimer = 3000;

  const baseScore = getZombieScoreValue(z.type);
  const streakBonus = Math.floor(state.killStreak / 5) * 5;
  const score = baseScore + streakBonus;
  state.score += score;

  // Death particles
  for (let i = 0; i < 28; i++) {
    state.particles.push({
      x: z.x,
      y: z.y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 28,
      maxLife: 28,
      color: i % 4 === 0 ? '#ef4444' : '#7a1010',
      size: 3 + Math.random() * 5,
    });
  }

  // Coin drop
  if (Math.random() < getZombieCoinChance(z.type)) {
    state.pickups.push({
      x: z.x,
      y: z.y,
      type: 'coin',
      bob: Math.random() * Math.PI * 2,
      life: 600,
    });
  }

  // Health drop (rare)
  if (Math.random() < 0.05) {
    state.pickups.push({
      x: z.x,
      y: z.y,
      type: 'health',
      bob: Math.random() * Math.PI * 2,
      life: 600,
    });
  }

  // Ammo drop for owned non-pistol weapons
  const ownedNonPistol = state.ownedWeapons.filter((w) => w !== 'pistol');
  if (ownedNonPistol.length > 0 && Math.random() < 0.08) {
    state.pickups.push({
      x: z.x,
      y: z.y,
      type: 'ammo',
      bob: Math.random() * Math.PI * 2,
      life: 600,
    });
  }

  state.floatingTexts.push({
    x: z.x,
    y: z.y,
    text: `+${score}`,
    color: '#fde047',
    life: 40,
    vy: -1.5,
  });
}

function addBloodStain(state: GameState, x: number, y: number, size: number): void {
  state.bloodStains ??= [];
  state.bloodStains.push({
    x,
    y,
    size,
    alpha: 0.18 + Math.random() * 0.18,
    rotation: Math.random() * Math.PI,
  });
  if (state.bloodStains.length > 180) state.bloodStains.splice(0, state.bloodStains.length - 180);
}

function updateParticles(state: GameState, dts: number): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dts;
    p.y += p.vy * dts;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dts;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateMuzzleFlashes(state: GameState, dts: number): void {
  state.muzzleFlashes ??= [];
  for (let i = state.muzzleFlashes.length - 1; i >= 0; i--) {
    state.muzzleFlashes[i].life -= dts;
    if (state.muzzleFlashes[i].life <= 0) state.muzzleFlashes.splice(i, 1);
  }
}

function updatePickups(state: GameState, dts: number): void {
  const p = state.player;
  const magnetLevel = state.upgradeLevels['magnet'] ?? 0;
  const magnetRange = 60 + magnetLevel * 40;

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.bob += dts * 0.1;
    pk.life -= dts;

    const d = dist(pk, p);
    if (d < magnetRange + (pk.type === 'coin' ? 0 : 20)) {
      // Magnet pull
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      pk.x += (dx / dd) * 4 * dts;
      pk.y += (dy / dd) * 4 * dts;
    }

    if (d < p.radius + 14) {
      collectPickup(state, pk);
      state.pickups.splice(i, 1);
      continue;
    }

    if (pk.life <= 0) state.pickups.splice(i, 1);
  }
}

function collectPickup(state: GameState, pk: Pickup): void {
  if (pk.type === 'coin') {
    state.coins += 5;
    state.floatingTexts.push({
      x: pk.x,
      y: pk.y,
      text: '+5',
      color: '#fbbf24',
      life: 30,
      vy: -1.5,
    });
  } else if (pk.type === 'health') {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 30);
    state.floatingTexts.push({
      x: pk.x,
      y: pk.y,
      text: '+30 HP',
      color: '#22c55e',
      life: 30,
      vy: -1.5,
    });
  } else if (pk.type === 'ammo') {
    const ownedNonPistol = state.ownedWeapons.filter((w) => w !== 'pistol');
    if (ownedNonPistol.length > 0) {
      const w = ownedNonPistol[Math.floor(Math.random() * ownedNonPistol.length)];
      state.ammo[w] = (state.ammo[w] ?? 0) + WEAPONS[w].ammoPerPickup;
      state.floatingTexts.push({
        x: pk.x,
        y: pk.y,
        text: `+${WEAPONS[w].ammoPerPickup} ${WEAPONS[w].name}`,
        color: WEAPONS[w].color,
        life: 30,
        vy: -1.5,
      });
    }
  }
}

function updateFloatingTexts(state: GameState, dts: number): void {
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const t = state.floatingTexts[i];
    t.y += t.vy * dts;
    t.life -= dts;
    if (t.life <= 0) state.floatingTexts.splice(i, 1);
  }
}

function updateWaveLogic(state: GameState, dt: number): void {
  if (state.betweenWaves) {
    state.waveBreakTimer -= dt / 1000;
    if (state.waveBreakTimer <= 0) {
      startWave(state);
    }
    return;
  }

  if (state.zombiesToSpawn > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.zombies.push(spawnZombie(state));
      state.zombiesToSpawn--;
      state.spawnTimer = Math.max(200, 800 - state.wave * 30);
    }
  }

  if (state.zombiesToSpawn === 0 && state.zombies.length === 0) {
    state.betweenWaves = true;
    state.waveBreakTimer = 4;
    // Bonus coins for clearing wave
    state.coins += 20 + state.wave * 5;
    state.floatingTexts.push({
      x: state.player.x,
      y: state.player.y - 40,
      text: `Wave ${state.wave} Cleared! +${20 + state.wave * 5}`,
      color: '#fbbf24',
      life: 80,
      vy: -0.8,
    });
  }
}

function updateCamera(state: GameState): void {
  // Camera follows player, centered on screen
  // cameraOffset is where the player appears on screen relative to world
  // We'll compute this in render based on canvas size
}
