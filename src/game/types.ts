export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export const DEFAULT_CAMERA_ZOOM = 1.32;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
}

export interface Zombie extends Entity {
  type: 'walker' | 'runner' | 'crawler' | 'frog' | 'brute' | 'bloater' | 'police' | 'military' | 'mutated';
  speed: number;
  damage: number;
  hearing: number;
  vision: number;
  aggression: number;
  alerted: boolean;
  targetX: number;
  targetY: number;
  hordeId: number;
  hitFlash: number;
  attackCooldown: number;
  slowTimer: number;
}

export type NpcRole = 'civilian' | 'police' | 'swat' | 'military';
export type NpcGoal = 'patrol' | 'travel' | 'fight' | 'hide' | 'run' | 'help' | 'loot' | 'escort' | 'heal' | 'callBackup';
export type InfectionStage = 'healthy' | 'bitten' | 'bleeding' | 'infected' | 'weak' | 'critical' | 'turning';
export type Emotion = 'calm' | 'afraid' | 'brave' | 'angry' | 'desperate';

export interface Npc extends Entity {
  role: NpcRole;
  name: string;
  fear: number;
  courage: number;
  stamina: number;
  ammo: number;
  weapon: 'none' | 'pistol' | 'shotgun' | 'rifle';
  hearing: number;
  vision: number;
  memoryX: number;
  memoryY: number;
  personality: 'protector' | 'coward' | 'looter' | 'medic' | 'hothead';
  friends: number[];
  family: number[];
  occupation: string;
  inventory: string[];
  money: number;
  infection: InfectionStage;
  infectionTimer: number;
  currentGoal: NpcGoal;
  emotion: Emotion;
  decisionTimer: number;
  targetX: number;
  targetY: number;
  radioCooldown: number;
}

export interface Vehicle extends Entity {
  kind: 'civilianCar' | 'policeCar' | 'ambulance' | 'militaryTruck' | 'helicopter';
  fuel: number;
  damage: number;
  siren: boolean;
  targetX: number;
  targetY: number;
}

export interface WorldEvent {
  id: number;
  kind: 'hospital_overrun' | 'checkpoint' | 'gas_explosion' | 'convoy' | 'helicopter_crash';
  x: number;
  y: number;
  timer: number;
  severity: number;
}

export interface RadioMessage {
  text: string;
  life: number;
  source: NpcRole | 'dispatch' | 'weather';
}

export interface CitySimulation {
  timeOfDay: number;
  weather: 'clear' | 'rain' | 'storm' | 'fog' | 'wind';
  weatherTimer: number;
  powerGrid: number;
  smoke: number;
  fire: number;
  outbreakLevel: number;
  eventTimer: number;
  nextEventId: number;
  radio: RadioMessage[];
  events: WorldEvent[];
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  pierce: number;
  radius: number;
  source: 'player' | 'ally';
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface MuzzleFlash {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Pickup {
  x: number;
  y: number;
  type: 'health' | 'ammo' | 'coin';
  bob: number;
  life: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

export interface BloodStain {
  x: number;
  y: number;
  size: number;
  alpha: number;
  rotation: number;
}

export interface UrbanObstacle {
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
  angle: number;
  kind: 'barricade' | 'dumpster' | 'sportsCar' | 'muscleCar';
  variant: number;
}

export interface RubbleZone {
  x: number;
  y: number;
  radius: number;
  variant: number;
}

export interface Streetlight {
  x: number;
  y: number;
  radius: number;
  phase: number;
}

export interface SpawnZone {
  x: number;
  y: number;
  radius: number;
  kind: 'alley' | 'sewer';
}

export interface WeaponDef {
  name: string;
  damage: number;
  fireRate: number; // ms between shots
  bulletSpeed: number;
  pierce: number;
  spread: number;
  pellets: number;
  color: string;
  bulletRadius: number;
  cost: number;
  ammoPerPickup: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    name: 'Pistol',
    damage: 25,
    fireRate: 320,
    bulletSpeed: 11,
    pierce: 0,
    spread: 0.04,
    pellets: 1,
    color: '#fde047',
    bulletRadius: 4,
    cost: 0,
    ammoPerPickup: 0,
  },
  smg: {
    name: 'SMG',
    damage: 18,
    fireRate: 90,
    bulletSpeed: 12,
    pierce: 0,
    spread: 0.12,
    pellets: 1,
    color: '#fca5a5',
    bulletRadius: 3.5,
    cost: 300,
    ammoPerPickup: 60,
  },
  shotgun: {
    name: 'Shotgun',
    damage: 22,
    fireRate: 650,
    bulletSpeed: 10,
    pierce: 1,
    spread: 0.32,
    pellets: 7,
    color: '#fb923c',
    bulletRadius: 4,
    cost: 500,
    ammoPerPickup: 12,
  },
  rifle: {
    name: 'Rifle',
    damage: 55,
    fireRate: 160,
    bulletSpeed: 16,
    pierce: 2,
    spread: 0.02,
    pellets: 1,
    color: '#7dd3fc',
    bulletRadius: 4,
    cost: 800,
    ammoPerPickup: 30,
  },
  minigun: {
    name: 'Minigun',
    damage: 30,
    fireRate: 45,
    bulletSpeed: 14,
    pierce: 1,
    spread: 0.16,
    pellets: 1,
    color: '#f0abfc',
    bulletRadius: 4,
    cost: 1500,
    ammoPerPickup: 100,
  },
};

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  maxLevel: number;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'speed',
    name: 'Swift Feet',
    description: 'Move 15% faster per level',
    cost: 200,
    icon: 'Boot',
    maxLevel: 4,
  },
  {
    id: 'maxhp',
    name: 'Iron Body',
    description: '+25 max health per level',
    cost: 250,
    icon: 'Heart',
    maxLevel: 4,
  },
  {
    id: 'regen',
    name: 'Regeneration',
    description: 'Slowly heal over time',
    cost: 400,
    icon: 'Plus',
    maxLevel: 3,
  },
  {
    id: 'firerate',
    name: 'Trigger Finger',
    description: 'Fire 12% faster per level',
    cost: 300,
    icon: 'Zap',
    maxLevel: 4,
  },
  {
    id: 'damage',
    name: 'Power Shots',
    description: '+20% bullet damage per level',
    cost: 350,
    icon: 'Crosshair',
    maxLevel: 4,
  },
  {
    id: 'magnet',
    name: 'Coin Magnet',
    description: 'Wider pickup range per level',
    cost: 200,
    icon: 'Magnet',
    maxLevel: 3,
  },
];

export interface GameState {
  phase: GamePhase;
  score: number;
  wave: number;
  kills: number;
  coins: number;
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    hp: number;
    maxHp: number;
    speed: number;
    angle: number;
    fireCooldown: number;
    invuln: number;
    regenAccum: number;
  };
  currentWeapon: string;
  ownedWeapons: string[];
  ammo: Record<string, number>;
  upgradeLevels: Record<string, number>;
  zombies: Zombie[];
  npcs: Npc[];
  vehicles: Vehicle[];
  bullets: Bullet[];
  particles: Particle[];
  muzzleFlashes: MuzzleFlash[];
  pickups: Pickup[];
  floatingTexts: FloatingText[];
  bloodStains: BloodStain[];
  obstacles: UrbanObstacle[];
  rubbleZones: RubbleZone[];
  streetlights: Streetlight[];
  spawnZones: SpawnZone[];
  waveTimer: number;
  zombiesToSpawn: number;
  spawnTimer: number;
  betweenWaves: boolean;
  waveBreakTimer: number;
  screenShake: number;
  keys: Record<string, boolean>;
  mouse: { x: number; y: number; down: boolean };
  cameraOffset: Vec2;
  worldSize: number;
  time: number;
  killStreak: number;
  streakTimer: number;
  canvasW: number;
  canvasH: number;
  cameraZoom: number;
  simulation: CitySimulation;
  soundEvents: string[];
}
