import type { GameState, Npc, Vehicle, Zombie, Vec2, UrbanObstacle, RubbleZone, Streetlight, SpawnZone } from './types';
import { DEFAULT_CAMERA_ZOOM } from './types';

export const WORLD_SIZE = 2400;

export function createInitialState(): GameState {
  return {
    phase: 'menu',
    score: 0,
    wave: 0,
    kills: 0,
    coins: 0,
    player: {
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      vx: 0,
      vy: 0,
      radius: 18,
      hp: 100,
      maxHp: 100,
      speed: 3.4,
      angle: 0,
      fireCooldown: 0,
      invuln: 0,
      regenAccum: 0,
    },
    currentWeapon: 'pistol',
    ownedWeapons: ['pistol', 'smg', 'shotgun', 'rifle', 'minigun'],
    ammo: { pistol: Infinity, smg: 240, shotgun: 48, rifle: 160, minigun: 500 },
    upgradeLevels: {},
    zombies: [],
    npcs: createInitialNpcs(),
    vehicles: [],
    bullets: [],
    particles: [],
    muzzleFlashes: [],
    pickups: [],
    floatingTexts: [],
    bloodStains: [],
    obstacles: createUrbanObstacles(),
    rubbleZones: createRubbleZones(),
    streetlights: createStreetlights(),
    spawnZones: createSpawnZones(),
    waveTimer: 0,
    zombiesToSpawn: 0,
    spawnTimer: 0,
    betweenWaves: true,
    waveBreakTimer: 3,
    screenShake: 0,
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    cameraOffset: { x: 0, y: 0 },
    worldSize: WORLD_SIZE,
    time: 0,
    killStreak: 0,
    streakTimer: 0,
    canvasW: 800,
    canvasH: 600,
    cameraZoom: DEFAULT_CAMERA_ZOOM,
    simulation: {
      timeOfDay: 7.5,
      weather: 'clear',
      weatherTimer: 45000,
      powerGrid: 1,
      smoke: 0,
      fire: 0,
      outbreakLevel: 0,
      eventTimer: 18000,
      nextEventId: 1,
      radio: [],
      events: [],
    },
    soundEvents: [],
  };
}

export function ensureStateDefaults(state: GameState): void {
  state.cameraZoom ??= DEFAULT_CAMERA_ZOOM;
  state.bloodStains ??= [];
  state.obstacles ??= createUrbanObstacles();
  state.rubbleZones ??= createRubbleZones();
  state.streetlights ??= createStreetlights();
  state.spawnZones ??= createSpawnZones();
  state.muzzleFlashes ??= [];
  state.soundEvents ??= [];
  state.ownedWeapons ??= ['pistol', 'smg', 'shotgun', 'rifle', 'minigun'];
  state.ammo ??= { pistol: Infinity, smg: 240, shotgun: 48, rifle: 160, minigun: 500 };
  for (const weapon of ['pistol', 'smg', 'shotgun', 'rifle', 'minigun']) {
    if (!state.ownedWeapons.includes(weapon)) state.ownedWeapons.push(weapon);
  }
  state.ammo.pistol = Infinity;
  state.ammo.smg ??= 240;
  state.ammo.shotgun ??= 48;
  state.ammo.rifle ??= 160;
  state.ammo.minigun ??= 500;
}

function createUrbanObstacles(): UrbanObstacle[] {
  const obstacles: UrbanObstacle[] = [];
  const kinds: UrbanObstacle['kind'][] = ['barricade', 'dumpster', 'sportsCar', 'muscleCar'];
  for (let i = 0; i < 58; i++) {
    const x = 150 + ((i * 389 + 61) % (WORLD_SIZE - 300));
    const y = 150 + ((i * 557 + 211) % (WORLD_SIZE - 300));
    if (dist({ x, y }, { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 }) < 230) continue;
    const kind = kinds[i % kinds.length];
    const vehicle = kind === 'sportsCar' || kind === 'muscleCar';
    obstacles.push({
      x,
      y,
      radius: vehicle ? 36 : kind === 'dumpster' ? 30 : 24,
      width: vehicle ? 92 : kind === 'dumpster' ? 58 : 70,
      height: vehicle ? 42 : kind === 'dumpster' ? 46 : 26,
      angle: ((i * 37) % 180) * Math.PI / 180,
      kind,
      variant: i % 5,
    });
  }
  return obstacles;
}

function createRubbleZones(): RubbleZone[] {
  const rubble: RubbleZone[] = [];
  for (let i = 0; i < 46; i++) {
    const x = 120 + ((i * 487 + 211) % (WORLD_SIZE - 240));
    const y = 120 + ((i * 271 + 83) % (WORLD_SIZE - 240));
    if (dist({ x, y }, { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 }) < 150) continue;
    rubble.push({
      x,
      y,
      radius: 46 + (i % 4) * 13,
      variant: i % 4,
    });
  }
  return rubble;
}

function createStreetlights(): Streetlight[] {
  const lights: Streetlight[] = [];
  for (let i = 0; i < 18; i++) {
    lights.push({
      x: 220 + ((i * 613 + 91) % (WORLD_SIZE - 440)),
      y: 220 + ((i * 353 + 319) % (WORLD_SIZE - 440)),
      radius: 155 + (i % 3) * 22,
      phase: i * 911,
    });
  }
  return lights;
}

function createSpawnZones(): SpawnZone[] {
  return [
    { x: 180, y: 320, radius: 46, kind: 'alley' },
    { x: WORLD_SIZE - 180, y: 420, radius: 46, kind: 'alley' },
    { x: 360, y: WORLD_SIZE - 210, radius: 42, kind: 'sewer' },
    { x: WORLD_SIZE - 340, y: WORLD_SIZE - 260, radius: 42, kind: 'sewer' },
    { x: WORLD_SIZE / 2 - 520, y: 190, radius: 46, kind: 'alley' },
    { x: WORLD_SIZE / 2 + 560, y: WORLD_SIZE - 190, radius: 46, kind: 'alley' },
  ];
}

const ZOMBIE_TYPES = {
  walker: { hp: 40, speed: 1.1, damage: 10, radius: 16, score: 10, coinChance: 0.25, coinAmount: 5, hearing: 260, vision: 220, aggression: 0.55 },
  runner: { hp: 28, speed: 2.6, damage: 8, radius: 13, score: 15, coinChance: 0.3, coinAmount: 8, hearing: 360, vision: 300, aggression: 0.75 },
  crawler: { hp: 24, speed: 0.8, damage: 7, radius: 12, score: 12, coinChance: 0.22, coinAmount: 5, hearing: 210, vision: 160, aggression: 0.45 },
  frog: { hp: 32, speed: 2.9, damage: 12, radius: 14, score: 22, coinChance: 0.32, coinAmount: 10, hearing: 380, vision: 320, aggression: 0.82 },
  brute: { hp: 180, speed: 0.7, damage: 25, radius: 28, score: 50, coinChance: 0.6, coinAmount: 20, hearing: 320, vision: 240, aggression: 0.85 },
  bloater: { hp: 90, speed: 0.85, damage: 16, radius: 23, score: 35, coinChance: 0.5, coinAmount: 15, hearing: 300, vision: 210, aggression: 0.65 },
  police: { hp: 60, speed: 1.25, damage: 12, radius: 17, score: 25, coinChance: 0.42, coinAmount: 12, hearing: 310, vision: 260, aggression: 0.7 },
  military: { hp: 95, speed: 1.35, damage: 15, radius: 18, score: 40, coinChance: 0.55, coinAmount: 18, hearing: 340, vision: 290, aggression: 0.78 },
  mutated: { hp: 240, speed: 1.55, damage: 32, radius: 31, score: 90, coinChance: 0.75, coinAmount: 30, hearing: 420, vision: 360, aggression: 1 },
} as const;

export function getZombieStats(type: keyof typeof ZOMBIE_TYPES, wave: number) {
  const base = ZOMBIE_TYPES[type];
  const hpScale = 1 + wave * 0.12;
  const speedScale = 1 + wave * 0.03;
  return {
    ...base,
    hp: Math.round(base.hp * hpScale),
    speed: base.speed * speedScale,
  };
}

export function spawnZombie(state: GameState): Zombie {
  const wave = state.wave;
  let type: Zombie['type'] = 'walker';

  const r = Math.random();
  if (wave >= 3 && r < 0.16) type = 'frog';
  else if (wave >= 9 && r < 0.21) type = 'mutated';
  else if (wave >= 7 && r < 0.12) type = 'military';
  else if (wave >= 5 && r < 0.2) type = 'bloater';
  else if (wave >= 4 && r < 0.32) type = 'police';
  else if (wave >= 3 && r < 0.44) type = 'brute';
  else if (wave >= 2 && r < 0.62) type = 'runner';
  else if (r < 0.22) type = 'crawler';
  else type = 'walker';

  const stats = getZombieStats(type, wave);

  const zones = state.spawnZones?.length ? state.spawnZones : createSpawnZones();
  const zone = zones[Math.floor(Math.random() * zones.length)];
  const angle = Math.random() * Math.PI * 2;
  const offset = Math.random() * zone.radius;
  const x = Math.max(40, Math.min(WORLD_SIZE - 40, zone.x + Math.cos(angle) * offset));
  const y = Math.max(40, Math.min(WORLD_SIZE - 40, zone.y + Math.sin(angle) * offset));

  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius: stats.radius,
    hp: stats.hp,
    maxHp: stats.hp,
    type,
    speed: stats.speed,
    damage: stats.damage,
    hearing: stats.hearing,
    vision: stats.vision,
    aggression: stats.aggression,
    alerted: false,
    targetX: state.player.x,
    targetY: state.player.y,
    hordeId: 0,
    hitFlash: 0,
    attackCooldown: 0,
    slowTimer: 0,
  };
}

function createInitialNpcs(): Npc[] {
  const roles: Npc['role'][] = ['civilian', 'civilian', 'civilian', 'police', 'civilian', 'civilian', 'civilian', 'military'];
  const personalities: Npc['personality'][] = ['protector', 'coward', 'looter', 'medic', 'hothead'];
  return roles.map((role, i) => ({
    x: 260 + ((i * 331) % (WORLD_SIZE - 520)),
    y: 260 + ((i * 547) % (WORLD_SIZE - 520)),
    vx: 0,
    vy: 0,
    radius: role === 'civilian' ? 14 : 16,
    hp: role === 'civilian' ? 70 : 110,
    maxHp: role === 'civilian' ? 70 : 110,
    role,
    name: `${role}-${i + 1}`,
    fear: role === 'civilian' ? 35 + (i % 4) * 12 : 18,
    courage: role === 'civilian' ? 25 + (i % 5) * 10 : 72,
    stamina: 80,
    ammo: role === 'civilian' ? (i % 3 === 0 ? 10 : 0) : role === 'police' ? 70 : 120,
    weapon: role === 'civilian' ? (i % 3 === 0 ? 'pistol' : 'none') : role === 'police' ? 'pistol' : 'rifle',
    hearing: 260,
    vision: role === 'civilian' ? 250 : 360,
    memoryX: WORLD_SIZE / 2,
    memoryY: WORLD_SIZE / 2,
    personality: personalities[i % personalities.length],
    friends: [],
    family: [],
    occupation: role === 'police' ? 'Officer' : ['Clerk', 'Doctor', 'Driver', 'Teacher'][i % 4],
    inventory: role === 'civilian' ? ['phone'] : ['radio', 'medkit'],
    money: 20 + i * 7,
    infection: 'healthy',
    infectionTimer: 0,
    currentGoal: role === 'police' ? 'patrol' : 'travel',
    emotion: 'calm',
    decisionTimer: 300 + i * 120,
    targetX: 180 + ((i * 613) % (WORLD_SIZE - 360)),
    targetY: 180 + ((i * 283) % (WORLD_SIZE - 360)),
    radioCooldown: 0,
  }));
}

function createInitialVehicles(): Vehicle[] {
  const kinds: Vehicle['kind'][] = ['civilianCar', 'policeCar', 'ambulance', 'civilianCar', 'helicopter'];
  return kinds.map((kind, i) => ({
    x: 350 + ((i * 421) % (WORLD_SIZE - 700)),
    y: 350 + ((i * 269) % (WORLD_SIZE - 700)),
    vx: 0,
    vy: 0,
    radius: kind === 'helicopter' ? 28 : 22,
    hp: 100,
    maxHp: 100,
    kind,
    fuel: 80 + i * 3,
    damage: 0,
    siren: kind === 'policeCar' || kind === 'ambulance',
    targetX: 200 + ((i * 733) % (WORLD_SIZE - 400)),
    targetY: 200 + ((i * 397) % (WORLD_SIZE - 400)),
  }));
}

export function getZombieScoreValue(type: Zombie['type']): number {
  return ZOMBIE_TYPES[type].score;
}

export function getZombieCoinChance(type: Zombie['type']): number {
  return ZOMBIE_TYPES[type].coinChance;
}

export function getZombieCoinAmount(type: Zombie['type']): number {
  return ZOMBIE_TYPES[type].coinAmount;
}

export function getZombieColor(type: Zombie['type']): string {
  switch (type) {
    case 'walker':
      return '#65a30d';
    case 'runner':
      return '#dc2626';
    case 'crawler':
      return '#4d5f2f';
    case 'frog':
      return '#16a34a';
    case 'brute':
      return '#7c2d12';
    case 'bloater':
      return '#86efac';
    case 'police':
      return '#2563eb';
    case 'military':
      return '#4d7c0f';
    case 'mutated':
      return '#c026d3';
  }
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}
