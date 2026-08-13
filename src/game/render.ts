import type { GameState, Zombie } from './types';
import { WEAPONS } from './types';
import { getZombieColor } from './engine';

const SPRITE_SHEET_SRC = new URL('../assets/apocalypse-sprites.png', import.meta.url).href;
const SPRITE_COLS = 4;
const SPRITE_ROWS = 3;
const SPRITES = {
  survivor: 0,
  civilian: 1,
  police: 2,
  military: 3,
  walker: 4,
  runner: 5,
  brute: 6,
  bloater: 7,
  policeZombie: 8,
  pistol: 9,
  shotgun: 10,
  rifle: 11,
} as const;

let spriteImage: HTMLImageElement | null = null;
let keyedSpriteSheet: HTMLCanvasElement | null = null;

function getKeyedSpriteSheet(): HTMLCanvasElement | null {
  if (!spriteImage) {
    spriteImage = new Image();
    spriteImage.src = SPRITE_SHEET_SRC;
  }
  if (!spriteImage.complete || spriteImage.naturalWidth === 0) return keyedSpriteSheet;
  if (keyedSpriteSheet) return keyedSpriteSheet;

  const canvas = document.createElement('canvas');
  canvas.width = spriteImage.naturalWidth;
  canvas.height = spriteImage.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(spriteImage, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > 145 && r < 95 && b < 95) data[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  keyedSpriteSheet = canvas;
  return keyedSpriteSheet;
}

function drawSprite(ctx: CanvasRenderingContext2D, spriteIndex: number, size: number, angle = 0): boolean {
  const sheet = getKeyedSpriteSheet();
  if (!sheet) return false;
  const cellW = sheet.width / SPRITE_COLS;
  const cellH = sheet.height / SPRITE_ROWS;
  const sx = (spriteIndex % SPRITE_COLS) * cellW;
  const sy = Math.floor(spriteIndex / SPRITE_COLS) * cellH;
  ctx.save();
  ctx.rotate(angle);
  ctx.drawImage(sheet, sx, sy, cellW, cellH, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

export function render(ctx: CanvasRenderingContext2D, state: GameState, canvasW: number, canvasH: number): void {
  state.canvasW = canvasW;
  state.canvasH = canvasH;

  const zoom = state.cameraZoom;
  const viewW = canvasW / zoom;
  const viewH = canvasH / zoom;
  const camX = state.player.x - viewW / 2;
  const camY = state.player.y - viewH / 2;

  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake : 0;

  ctx.save();
  ctx.translate(canvasW / 2 + shakeX, canvasH / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-state.player.x, -state.player.y);

  drawGround(ctx, state, camX, camY, viewW, viewH);
  drawWorldBounds(ctx, state);
  drawRubbleZones(ctx, state, camX, camY, viewW, viewH);
  drawSpawnZones(ctx, state, camX, camY, viewW, viewH);
  drawStreetlightPools(ctx, state);
  drawBloodStains(ctx, state);
  drawUrbanObstacles(ctx, state, camX, camY, viewW, viewH);
  drawPickups(ctx, state);
  drawBullets(ctx, state);
  drawMuzzleFlashes(ctx, state);
  drawNpcs(ctx, state);
  drawZombies(ctx, state);
  drawPlayer(ctx, state);
  drawParticles(ctx, state);
  drawFloatingTexts(ctx, state);

  ctx.restore();

  drawWeatherAndTime(ctx, state, canvasW, canvasH);
  drawAimReticle(ctx, state);
  drawLowHealthOverlay(ctx, state, canvasW, canvasH);
}

function drawGround(ctx: CanvasRenderingContext2D, state: GameState, camX: number, camY: number, w: number, h: number): void {
  const grad = ctx.createLinearGradient(camX, camY, camX, camY + h);
  grad.addColorStop(0, '#242424');
  grad.addColorStop(0.5, '#1a1c1f');
  grad.addColorStop(1, '#111214');
  ctx.fillStyle = grad;
  ctx.fillRect(camX - 10, camY - 10, w + 20, h + 20);

  ctx.strokeStyle = 'rgba(75, 78, 82, 0.7)';
  ctx.lineWidth = 96;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const y = ((i * 470 + 180) % state.worldSize);
    ctx.moveTo(camX - 120, y + Math.sin(i) * 60);
    ctx.bezierCurveTo(camX + w * 0.3, y - 90, camX + w * 0.65, y + 120, camX + w + 120, y - 30);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(10, 10, 12, 0.45)';
  ctx.lineWidth = 18;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const x = ((i * 620 + 260) % state.worldSize);
    ctx.moveTo(x, camY - 140);
    ctx.bezierCurveTo(x + 80, camY + h * 0.3, x - 120, camY + h * 0.7, x + 50, camY + h + 140);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(210, 210, 190, 0.06)';
  ctx.lineWidth = 1;
  const gridSize = 120;
  const startX = Math.floor(camX / gridSize) * gridSize;
  const startY = Math.floor(camY / gridSize) * gridSize;
  for (let x = startX; x < camX + w + gridSize; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, camY - 10);
    ctx.lineTo(x, camY + h + 10);
    ctx.stroke();
  }
  for (let y = startY; y < camY + h + gridSize; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(camX - 10, y);
    ctx.lineTo(camX + w + 10, y);
    ctx.stroke();
  }

  for (let i = 0; i < 120; i++) {
    const tx = (i * 197 + 83) % state.worldSize;
    const ty = (i * 313 + 151) % state.worldSize;
    if (tx < camX - 80 || tx > camX + w + 80 || ty < camY - 80 || ty > camY + h + 80) continue;
    ctx.strokeStyle = `rgba(180, 180, 170, ${0.08 + (i % 3) * 0.03})`;
    ctx.lineWidth = 1 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(tx - 18 - (i % 5), ty);
    ctx.lineTo(tx + 18 + (i % 7), ty + 6 - (i % 4));
    ctx.stroke();
  }

  for (let i = 0; i < 80; i++) {
    const sx = (i * 271 + 49) % state.worldSize;
    const sy = (i * 167 + 91) % state.worldSize;
    if (sx < camX - 20 || sx > camX + w + 20 || sy < camY - 20 || sy > camY + h + 20) continue;
    ctx.strokeStyle = `rgba(115, 120, 112, ${0.14 + (i % 3) * 0.03})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 6 + (i % 4), sy - 12 - (i % 7));
    ctx.stroke();
  }
}

function drawBloodStains(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  const bloodStains = state.bloodStains ?? [];
  for (const stain of bloodStains) {
    ctx.save();
    ctx.translate(stain.x, stain.y);
    ctx.rotate(stain.rotation);
    ctx.fillStyle = `rgba(95, 5, 5, ${stain.alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, stain.size * 1.25, stain.size * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(35, 0, 0, ${stain.alpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(stain.size * 0.25, -stain.size * 0.1, stain.size * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const seed = Math.floor(state.worldSize / 100);
  for (let i = 0; i < 50; i++) {
    const sx = ((i * 137 + seed * 53) % state.worldSize);
    const sy = ((i * 211 + seed * 79) % state.worldSize);
    const dx = sx - state.player.x;
    const dy = sy - state.player.y;
    if (Math.abs(dx) > 800 || Math.abs(dy) > 600) continue;
    ctx.fillStyle = `rgba(60, 8, 8, ${0.12 + (i % 4) * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 25 + (i % 5) * 12, 18 + (i % 3) * 8, i * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(40, 5, 5, ${0.1 + (i % 3) * 0.03})`;
    ctx.beginPath();
    ctx.arc(sx + (i % 7) * 5, sy + (i % 5) * 4, 4 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWorldBounds(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.strokeStyle = 'rgba(180, 30, 30, 0.3)';
  ctx.lineWidth = 5;
  ctx.setLineDash([16, 8]);
  ctx.strokeRect(0, 0, state.worldSize, state.worldSize);
  ctx.setLineDash([]);
}

function drawWorldEvents(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const event of state.simulation.events) {
    ctx.save();
    ctx.translate(event.x, event.y);
    const pulse = 0.6 + Math.sin(state.time * 0.006 + event.id) * 0.25;
    ctx.strokeStyle = event.kind === 'gas_explosion' ? `rgba(239, 68, 68, ${pulse})` : `rgba(251, 191, 36, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, 42 + event.severity * 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (event.kind === 'gas_explosion' || event.kind === 'helicopter_crash') {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawVehicles(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const v of state.vehicles) {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(Math.atan2(v.vy, v.vx));
    const color = v.kind === 'policeCar' ? '#1f2937' : v.kind === 'ambulance' ? '#f8fafc' : v.kind === 'militaryTruck' ? '#3f4a2f' : v.kind === 'helicopter' ? '#374151' : '#475569';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 12, v.radius * 1.3, v.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(-v.radius * 1.15, -v.radius * 0.55, v.radius * 2.3, v.radius * 1.1);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.strokeRect(-v.radius * 1.15, -v.radius * 0.55, v.radius * 2.3, v.radius * 1.1);
    if (v.kind === 'helicopter') {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.lineTo(34, 0);
      ctx.moveTo(0, -28);
      ctx.lineTo(0, 28);
      ctx.stroke();
    }
    if (v.siren) {
      const flash = Math.floor(state.time / 180) % 2 === 0;
      ctx.fillStyle = flash ? '#ef4444' : '#3b82f6';
      ctx.fillRect(-5, -v.radius * 0.68, 10, 4);
    }
    ctx.restore();
  }
}

function drawNpcs(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const npc of state.npcs) {
    ctx.save();
    ctx.translate(npc.x, npc.y);
    const angle = Math.atan2(npc.vy, npc.vx);
    ctx.rotate(Number.isFinite(angle) ? angle : 0);
    const sprite = npc.role === 'civilian' ? SPRITES.civilian : npc.role === 'police' || npc.role === 'swat' ? SPRITES.police : SPRITES.military;
    if (drawSprite(ctx, sprite, npc.radius * 5.8, Math.PI / 2)) {
      if (npc.infection !== 'healthy') {
        ctx.strokeStyle = '#84cc16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, npc.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    ctx.fillStyle = npc.role === 'civilian' ? '#38bdf8' : npc.role === 'police' ? '#2563eb' : npc.role === 'swat' ? '#111827' : '#4d7c0f';
    ctx.beginPath();
    ctx.arc(0, 0, npc.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = npc.emotion === 'afraid' ? '#fbbf24' : npc.emotion === 'brave' ? '#22c55e' : '#e5e7eb';
    ctx.beginPath();
    ctx.arc(npc.radius * 0.38, -npc.radius * 0.25, 3, 0, Math.PI * 2);
    ctx.arc(npc.radius * 0.38, npc.radius * 0.25, 3, 0, Math.PI * 2);
    ctx.fill();
    if (npc.weapon !== 'none') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(npc.radius * 0.4, 0);
      ctx.lineTo(npc.radius * 1.3, 0);
      ctx.stroke();
    }
    if (npc.infection !== 'healthy') {
      ctx.strokeStyle = '#84cc16';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, npc.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// === DETAILED ZOMBIE RENDERING ===

function drawZombies(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const z of state.zombies) {
    if (!isVisibleToPlayer(state, z.x, z.y, z.radius)) continue;
    drawDetailedZombie(ctx, z, state.time);
  }
}

function drawUrbanObstacles(ctx: CanvasRenderingContext2D, state: GameState, camX: number, camY: number, w: number, h: number): void {
  for (const obstacle of state.obstacles) {
    if (obstacle.x < camX - 100 || obstacle.x > camX + w + 100 || obstacle.y < camY - 100 || obstacle.y > camY + h + 100) continue;
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(obstacle.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(8, 12, obstacle.width * 0.55, obstacle.height * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const color = obstacle.kind === 'dumpster' ? '#1f4b3c' : obstacle.kind === 'barricade' ? '#8a8177' : obstacle.kind === 'sportsCar' ? '#29384f' : '#5b2f2f';
    ctx.fillStyle = color;
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height, obstacle.kind === 'barricade' ? 3 : 9);
    ctx.fill();
    ctx.stroke();
    if (obstacle.kind === 'sportsCar' || obstacle.kind === 'muscleCar') {
      ctx.fillStyle = '#111827';
      ctx.fillRect(-obstacle.width * 0.2, -obstacle.height * 0.32, obstacle.width * 0.4, obstacle.height * 0.64);
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(-obstacle.width * 0.42, -obstacle.height * 0.62, obstacle.width * 0.2, obstacle.height * 0.16);
      ctx.fillRect(obstacle.width * 0.22, -obstacle.height * 0.62, obstacle.width * 0.2, obstacle.height * 0.16);
      ctx.fillRect(-obstacle.width * 0.42, obstacle.height * 0.46, obstacle.width * 0.2, obstacle.height * 0.16);
      ctx.fillRect(obstacle.width * 0.22, obstacle.height * 0.46, obstacle.width * 0.2, obstacle.height * 0.16);
    } else if (obstacle.kind === 'barricade') {
      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-obstacle.width * 0.38, -obstacle.height * 0.2);
      ctx.lineTo(obstacle.width * 0.38, obstacle.height * 0.2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-obstacle.width * 0.36, -obstacle.height * 0.28, obstacle.width * 0.72, obstacle.height * 0.56);
    }
    ctx.restore();
  }
}

function drawRubbleZones(ctx: CanvasRenderingContext2D, state: GameState, camX: number, camY: number, w: number, h: number): void {
  for (const rubble of state.rubbleZones) {
    if (rubble.x < camX - 90 || rubble.x > camX + w + 90 || rubble.y < camY - 90 || rubble.y > camY + h + 90) continue;
    ctx.save();
    ctx.translate(rubble.x, rubble.y);
    ctx.fillStyle = 'rgba(95, 90, 84, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rubble.radius * 1.1, rubble.radius * 0.75, rubble.variant * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 145, 134, 0.45)';
    for (let i = 0; i < 13; i++) {
      const a = i * 1.7 + rubble.variant;
      const d = rubble.radius * (0.15 + (i % 5) * 0.15);
      ctx.beginPath();
      ctx.rect(Math.cos(a) * d, Math.sin(a) * d * 0.7, 8 + (i % 4) * 4, 5 + (i % 3) * 3);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawSpawnZones(ctx: CanvasRenderingContext2D, state: GameState, camX: number, camY: number, w: number, h: number): void {
  for (const zone of state.spawnZones) {
    if (zone.x < camX - 80 || zone.x > camX + w + 80 || zone.y < camY - 80 || zone.y > camY + h + 80) continue;
    ctx.save();
    ctx.translate(zone.x, zone.y);
    ctx.fillStyle = zone.kind === 'sewer' ? '#050505' : 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, zone.radius, zone.radius * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#52525b';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-zone.radius * 0.65, -zone.radius * 0.25 + i * zone.radius * 0.12);
      ctx.lineTo(zone.radius * 0.65, -zone.radius * 0.25 + i * zone.radius * 0.12);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawStreetlightPools(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const light of state.streetlights) {
    const on = isStreetlightOn(state, light);
    ctx.save();
    ctx.translate(light.x, light.y);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-4, -30, 8, 30);
    ctx.fillStyle = on ? '#fde68a' : '#3f3f46';
    ctx.beginPath();
    ctx.arc(0, -32, 7, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      const alpha = 0.2 + Math.sin(state.time * 0.004 + light.phase) * 0.035;
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, light.radius);
      grad.addColorStop(0, `rgba(253, 230, 138, ${alpha})`);
      grad.addColorStop(0.55, `rgba(250, 204, 21, ${alpha * 0.35})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, light.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawDetailedZombie(ctx: CanvasRenderingContext2D, z: Zombie, time: number): void {
  const r = z.radius;
  ctx.save();
  ctx.translate(z.x, z.y);

  const facingAngle = Math.atan2(z.vy, z.vx);
  if (z.type === 'frog') {
    drawFrogEnemy(ctx, z, time, facingAngle);
    ctx.restore();
    return;
  }
  const spriteKey = z.type === 'police' ? SPRITES.policeZombie : z.type === 'military' ? SPRITES.military : z.type === 'crawler' ? SPRITES.walker : z.type === 'mutated' ? SPRITES.brute : SPRITES[z.type];
  const walkBob = Math.sin(time * 0.012 + z.x * 0.03) * (Math.abs(z.vx) + Math.abs(z.vy) > 0.1 ? 3 : 0);
  ctx.translate(0, walkBob);
  if (drawSprite(ctx, spriteKey, r * 5.8, facingAngle + Math.PI / 2)) {
    ctx.strokeStyle = z.alerted ? 'rgba(239, 68, 68, 0.55)' : 'rgba(127, 29, 29, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    if (z.hitFlash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (z.hp < z.maxHp) {
      const barW = r * 2.2;
      const barH = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(-barW / 2 - 1, -r - 18, barW + 2, barH + 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-barW / 2, -r - 17, barW * (z.hp / z.maxHp), barH);
    }
    ctx.restore();
    return;
  }
  const walkPhase = Math.sin(time * 0.006 + z.x * 0.01);
  const legSwing = walkPhase * r * 0.35;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.85, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(facingAngle);

  const flash = z.hitFlash > 0;
  const skinBase = flash ? '#ffffff' : getSkinColor(z.type);
  const skinDark = flash ? '#dddddd' : darkenHex(getSkinColor(z.type), 0.5);
  const skinLight = flash ? '#ffdddd' : lightenHex(getSkinColor(z.type), 0.15);
  const clothColor = getClothColor(z.type);
  const clothDark = darkenHex(clothColor, 0.4);
  const bloodColor = flash ? '#ff9999' : '#5c0a0a';

  // === LEGS ===
  ctx.strokeStyle = clothDark;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.25);
  ctx.lineTo(-r * 0.5 - legSwing, -r * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, r * 0.25);
  ctx.lineTo(-r * 0.5 + legSwing, r * 0.55);
  ctx.stroke();

  // Shoes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(-r * 0.55 - legSwing, -r * 0.6, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(-r * 0.55 + legSwing, r * 0.6, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // === TORSO (torn shirt) ===
  const torsoGrad = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
  torsoGrad.addColorStop(0, clothColor);
  torsoGrad.addColorStop(1, clothDark);
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.45);
  ctx.lineTo(r * 0.25, -r * 0.5);
  ctx.lineTo(r * 0.3, r * 0.1);
  ctx.lineTo(r * 0.1, r * 0.5);
  ctx.lineTo(-r * 0.35, r * 0.45);
  ctx.lineTo(-r * 0.4, 0);
  ctx.closePath();
  ctx.fill();

  // Torn fabric edges
  ctx.strokeStyle = clothDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Exposed flesh on torso
  ctx.fillStyle = skinDark;
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, -r * 0.3);
  ctx.lineTo(r * 0.15, -r * 0.2);
  ctx.lineTo(r * 0.1, r * 0.15);
  ctx.lineTo(-r * 0.1, r * 0.1);
  ctx.closePath();
  ctx.fill();

  // Blood stain on chest
  ctx.fillStyle = bloodColor;
  ctx.beginPath();
  ctx.ellipse(r * 0.05, -r * 0.05, r * 0.18, r * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(40, 0, 0, 0.5)`;
  ctx.beginPath();
  ctx.ellipse(r * 0.08, 0, r * 0.1, r * 0.14, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // === ARMS (reaching forward) ===
  const armSwing = walkPhase * r * 0.15;

  // Left arm
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.4);
  ctx.quadraticCurveTo(r * 0.5, -r * 0.5 + armSwing, r * 0.9, -r * 0.35 + armSwing);
  ctx.stroke();

  // Right arm
  ctx.beginPath();
  ctx.moveTo(r * 0.1, r * 0.4);
  ctx.quadraticCurveTo(r * 0.5, r * 0.5 - armSwing, r * 0.9, r * 0.35 - armSwing);
  ctx.stroke();

  // Torn sleeve on left arm
  ctx.fillStyle = clothDark;
  ctx.beginPath();
  ctx.ellipse(r * 0.3, -r * 0.42 + armSwing * 0.5, r * 0.12, r * 0.08, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Hands (clawed)
  ctx.fillStyle = skinBase;
  ctx.beginPath();
  ctx.arc(r * 0.95, -r * 0.35 + armSwing, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.95, r * 0.35 - armSwing, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Fingers/claws
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const fy = -r * 0.35 + armSwing + (i - 1) * r * 0.06;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, fy);
    ctx.lineTo(r * 1.15, fy + r * 0.02);
    ctx.stroke();
    const fy2 = r * 0.35 - armSwing + (i - 1) * r * 0.06;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, fy2);
    ctx.lineTo(r * 1.15, fy2 + r * 0.02);
    ctx.stroke();
  }

  // === HEAD ===
  const headGrad = ctx.createRadialGradient(r * 0.55, -r * 0.15, 0, r * 0.5, 0, r * 0.5);
  headGrad.addColorStop(0, skinLight);
  headGrad.addColorStop(0.6, skinBase);
  headGrad.addColorStop(1, skinDark);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(r * 0.5, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Exposed bone/jaw on one side
  ctx.fillStyle = '#d4c5a0';
  ctx.beginPath();
  ctx.ellipse(r * 0.62, r * 0.15, r * 0.12, r * 0.08, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9a8a60';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Teeth
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(r * 0.55 + i * r * 0.04, r * 0.1);
    ctx.lineTo(r * 0.55 + i * r * 0.04, r * 0.2);
    ctx.stroke();
  }

  // Eye sockets (dark, sunken)
  ctx.fillStyle = '#0a0000';
  ctx.beginPath();
  ctx.ellipse(r * 0.5, -r * 0.15, r * 0.1, r * 0.08, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.5, r * 0.15, r * 0.1, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glowing eyes
  const eyeColor = z.type === 'bloater' ? '#22c55e' : z.type === 'brute' || z.type === 'mutated' ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = eyeColor;
  ctx.shadowColor = eyeColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(r * 0.53, -r * 0.15, r * 0.04, 0, Math.PI * 2);
  ctx.arc(r * 0.53, r * 0.15, r * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Mouth (snarling)
  ctx.fillStyle = '#1a0000';
  ctx.beginPath();
  ctx.ellipse(r * 0.68, 0, r * 0.08, r * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // Blood drip from mouth
  ctx.fillStyle = bloodColor;
  ctx.beginPath();
  ctx.moveTo(r * 0.68, r * 0.03);
  ctx.lineTo(r * 0.66, r * 0.15);
  ctx.lineTo(r * 0.7, r * 0.15);
  ctx.closePath();
  ctx.fill();

  // Scars / gashes on head
  ctx.strokeStyle = bloodColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r * 0.35, -r * 0.3);
  ctx.lineTo(r * 0.45, -r * 0.1);
  ctx.stroke();

  // Type-specific extras
  if (z.type === 'brute') {
    // Larger, more muscular - extra mass
    ctx.fillStyle = clothDark;
    ctx.beginPath();
    ctx.ellipse(r * 0.15, -r * 0.55, r * 0.2, r * 0.12, 0.3, 0, Math.PI * 2);
    ctx.ellipse(r * 0.15, r * 0.55, r * 0.2, r * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Shoulder spikes
    ctx.strokeStyle = '#3d2817';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.5);
    ctx.lineTo(r * 0.05, -r * 0.65);
    ctx.stroke();
  }

  if (z.type === 'bloater') {
    // Green bile dripping
    ctx.fillStyle = 'rgba(100, 200, 50, 0.6)';
    ctx.beginPath();
    ctx.arc(r * 0.72, r * 0.08, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.75, r * 0.2, r * 0.03, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Health bar
  if (z.hp < z.maxHp) {
    const barW = r * 2.2;
    const barH = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(-barW / 2 - 1, -r - 14, barW + 2, barH + 2);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-barW / 2, -r - 13, barW * (z.hp / z.maxHp), barH);
  }

  ctx.restore();
}

function drawFrogEnemy(ctx: CanvasRenderingContext2D, z: Zombie, time: number, facingAngle: number): void {
  const r = z.radius;
  const hop = Math.abs(Math.sin(time * 0.018 + z.x * 0.02)) * 6;
  ctx.save();
  ctx.rotate(facingAngle);
  ctx.translate(0, -hop);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.8 + hop, r * 1.2, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = z.hitFlash > 0 ? '#ffffff' : '#22c55e';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 0.4, r * 0.32, 0, Math.PI * 2);
  ctx.arc(r * 0.55, r * 0.4, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.arc(r * 0.64, -r * 0.4, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.64, r * 0.4, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.55);
  ctx.lineTo(-r * 1.1, -r * 1.05);
  ctx.moveTo(-r * 0.3, r * 0.55);
  ctx.lineTo(-r * 1.1, r * 1.05);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function getSkinColor(type: Zombie['type']): string {
  switch (type) {
    case 'walker': return '#7a8a55';
    case 'runner': return '#9a4040';
    case 'crawler': return '#68724c';
    case 'frog': return '#22c55e';
    case 'brute': return '#6b5240';
    case 'bloater': return '#88a070';
    case 'police': return '#6f8aa1';
    case 'military': return '#69784f';
    case 'mutated': return '#9b4d7d';
  }
}

function getClothColor(type: Zombie['type']): string {
  switch (type) {
    case 'walker': return '#3a4520';
    case 'runner': return '#5a2020';
    case 'crawler': return '#2f351b';
    case 'frog': return '#14532d';
    case 'brute': return '#3d2817';
    case 'bloater': return '#2a4a2a';
    case 'police': return '#1e3a5f';
    case 'military': return '#34441f';
    case 'mutated': return '#4c1d40';
  }
}

function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * amount)}, ${Math.round(g * amount)}, ${Math.round(b * amount)})`;
}

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))}, ${Math.min(255, Math.round(g + (255 - g) * amount))}, ${Math.min(255, Math.round(b + (255 - b) * amount))})`;
}

// === DETAILED PLAYER & WEAPONS ===

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
  const p = state.player;
  const invulnFlash = p.invuln > 0 && Math.floor(p.invuln / 80) % 2 === 0;

  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, p.radius * 0.85, p.radius * 0.9, p.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(p.angle);

  ctx.fillStyle = '#2d2d2d';
  ctx.beginPath();
  ctx.ellipse(-p.radius * 0.38, -p.radius * 0.34, p.radius * 0.22, p.radius * 0.42, -0.25, 0, Math.PI * 2);
  ctx.ellipse(-p.radius * 0.38, p.radius * 0.34, p.radius * 0.22, p.radius * 0.42, 0.25, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(-p.radius * 0.8, 0, p.radius * 0.8, 0);
  bodyGrad.addColorStop(0, invulnFlash ? '#fca5a5' : '#4a4a4a');
  bodyGrad.addColorStop(1, invulnFlash ? '#dc2626' : '#2a2a2a');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.radius * 0.88, p.radius * 0.64, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-p.radius * 0.45, -p.radius * 0.35);
  ctx.lineTo(p.radius * 0.3, p.radius * 0.2);
  ctx.moveTo(-p.radius * 0.45, p.radius * 0.35);
  ctx.lineTo(p.radius * 0.3, -p.radius * 0.2);
  ctx.stroke();

  ctx.fillStyle = invulnFlash ? '#fecaca' : '#c9a570';
  ctx.beginPath();
  ctx.arc(p.radius * 0.42, 0, p.radius * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6540';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#1a3a1a';
  ctx.beginPath();
  ctx.arc(p.radius * 0.52, 0, p.radius * 0.36, -Math.PI / 2, Math.PI / 2);
  ctx.fill();

  drawAimingHands(ctx, p.radius);
  drawDetailedWeapon(ctx, state.currentWeapon);

  ctx.restore();

  ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius * 1.55, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawAimingHands(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#b98f5c';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(radius * 0.12, -radius * 0.44);
  ctx.lineTo(radius * 1.25, -radius * 0.16);
  ctx.moveTo(radius * 0.12, radius * 0.44);
  ctx.lineTo(radius * 1.25, radius * 0.16);
  ctx.stroke();

  ctx.fillStyle = '#d0a16b';
  ctx.beginPath();
  ctx.arc(radius * 1.25, -radius * 0.16, 3.5, 0, Math.PI * 2);
  ctx.arc(radius * 1.25, radius * 0.16, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawDetailedWeapon(ctx: CanvasRenderingContext2D, weaponKey: string): void {
  const r = 20;
  switch (weaponKey) {
    case 'pistol': {
      // Slide
      const grad = ctx.createLinearGradient(0, -4, 0, 4);
      grad.addColorStop(0, '#4a4a4a');
      grad.addColorStop(0.5, '#2d2d2d');
      grad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = grad;
      ctx.fillRect(r - 2, -3.5, 18, 7);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r - 2, -3.5, 18, 7);
      // Barrel tip
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(r + 15, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Grip
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(r - 2, 2);
      ctx.lineTo(r - 4, 12);
      ctx.lineTo(r + 2, 12);
      ctx.lineTo(r + 4, 3);
      ctx.closePath();
      ctx.fill();
      // Trigger guard
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r + 2, 5, 4, 0, Math.PI);
      ctx.stroke();
      break;
    }
    case 'smg': {
      // Body
      const grad = ctx.createLinearGradient(0, -3, 0, 3);
      grad.addColorStop(0, '#3a3a3a');
      grad.addColorStop(0.5, '#222');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
      ctx.fillRect(r - 2, -3, 26, 6);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r - 2, -3, 26, 6);
      // Magazine
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(r + 4, 3, 7, 12);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r + 4, 3, 7, 12);
      // Stock
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(r - 6, -2, 5, 4);
      // Front sight
      ctx.fillStyle = '#555';
      ctx.fillRect(r + 20, -5, 2, 2);
      // Barrel
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(r + 23, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shotgun': {
      // Wooden pump grip
      ctx.fillStyle = '#5c3d1e';
      ctx.fillRect(r - 4, -3, 8, 6);
      ctx.strokeStyle = '#3d2817';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r - 4, -3, 8, 6);
      // Barrel
      const grad = ctx.createLinearGradient(0, -2.5, 0, 2.5);
      grad.addColorStop(0, '#3a3a3a');
      grad.addColorStop(0.5, '#1a1a1a');
      grad.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = grad;
      ctx.fillRect(r + 4, -2.5, 28, 5);
      // Barrel tip
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(r + 31, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      // Pump
      ctx.fillStyle = '#4a2d17';
      ctx.fillRect(r + 8, -4, 6, 8);
      // Stock
      ctx.fillStyle = '#3d2817';
      ctx.beginPath();
      ctx.moveTo(r - 4, -3);
      ctx.lineTo(r - 10, -2);
      ctx.lineTo(r - 10, 2);
      ctx.lineTo(r - 4, 3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rifle': {
      // Body
      const grad = ctx.createLinearGradient(0, -2.5, 0, 2.5);
      grad.addColorStop(0, '#3a3a3a');
      grad.addColorStop(0.5, '#222');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
      ctx.fillRect(r - 2, -2.5, 38, 5);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r - 2, -2.5, 38, 5);
      // Magazine
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(r + 6, 2.5, 6, 10);
      ctx.strokeRect(r + 6, 2.5, 6, 10);
      // Scope
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(r + 12, -6, 10, 3);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r + 12, -6, 10, 3);
      // Scope lens
      ctx.fillStyle = '#1a3a5a';
      ctx.beginPath();
      ctx.arc(r + 21, -4.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Stock
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(r - 8, -3, 7, 6);
      // Front sight
      ctx.fillStyle = '#555';
      ctx.fillRect(r + 32, -4, 2, 2);
      // Barrel tip
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(r + 35, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'minigun': {
      // Main body
      const grad = ctx.createLinearGradient(0, -5, 0, 5);
      grad.addColorStop(0, '#4a4a4a');
      grad.addColorStop(0.5, '#2d2d2d');
      grad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = grad;
      ctx.fillRect(r - 2, -5, 28, 10);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r - 2, -5, 28, 10);
      // Multiple barrels
      ctx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 4; i++) {
        const by = -3.5 + i * 2.3;
        ctx.fillRect(r + 24, by, 12, 1.8);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(r + 24, by, 12, 1.8);
      }
      // Barrel tips
      ctx.fillStyle = '#000';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(r + 35, -3.5 + i * 2.3 + 0.9, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Ammo box
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(r + 2, 4, 8, 6);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(r + 2, 4, 8, 6);
      // Handles
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(r - 6, -4, 5, 3);
      ctx.fillRect(r - 6, 1, 5, 3);
      break;
    }
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const b of state.bullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const angle = Math.atan2(b.vy, b.vx);
    ctx.rotate(angle);

    // Trail
    const trailGrad = ctx.createLinearGradient(-10, 0, 0, 0);
    trailGrad.addColorStop(0, 'rgba(255, 220, 100, 0)');
    trailGrad.addColorStop(1, 'rgba(255, 220, 100, 0.4)');
    ctx.fillStyle = trailGrad;
    ctx.beginPath();
    ctx.ellipse(-8, 0, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bullet casing
    ctx.fillStyle = b.color ?? WEAPONS[state.currentWeapon].color;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.radius * 1.5, b.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bright tip
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.radius * 0.5, 0, b.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawMuzzleFlashes(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const flash of state.muzzleFlashes ?? []) {
    const alpha = Math.max(0, Math.min(1, flash.life / flash.maxLife));
    ctx.save();
    ctx.translate(flash.x, flash.y);
    ctx.rotate(flash.angle);
    ctx.globalAlpha = alpha;

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, flash.size);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#fde68a');
    grad.addColorStop(0.72, flash.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-flash.size * 0.25, -flash.size * 0.28);
    ctx.lineTo(flash.size * 1.2, 0);
    ctx.lineTo(-flash.size * 0.25, flash.size * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(flash.size * 0.12, 0, flash.size * 0.42, flash.size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPickups(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const pk of state.pickups) {
    const bobY = Math.sin(pk.bob) * 4;
    const blink = pk.life < 100 && Math.floor(pk.life / 10) % 2 === 0;
    if (blink) continue;

    ctx.save();
    ctx.translate(pk.x, pk.y + bobY);

    const glowColor = pk.type === 'coin' ? 'rgba(251, 191, 36, 0.25)' : pk.type === 'health' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(125, 211, 252, 0.25)';
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();

    if (pk.type === 'coin') {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0);
    } else if (pk.type === 'health') {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-10, -3, 20, 6);
      ctx.fillRect(-3, -10, 6, 20);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-8, -1.5, 16, 3);
      ctx.fillRect(-1.5, -8, 3, 16);
    } else if (pk.type === 'ammo') {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-9, -7, 18, 14);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-9, -7, 18, 14);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-6, -4, 3, 6);
      ctx.fillRect(-1, -4, 3, 6);
      ctx.fillRect(4, -4, 3, 6);
    }

    ctx.restore();
  }
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const t of state.floatingTexts) {
    const alpha = Math.min(1, t.life / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = t.color;
    ctx.font = 'bold 16px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawCityDarkness(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  if (state.phase !== 'playing') return;
  const px = w / 2;
  const py = h / 2;
  const angle = Math.atan2(state.mouse.y - py, state.mouse.x - px);
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 10, 0.42)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const glow = ctx.createRadialGradient(px, py, 40, px, py, 340);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.55, 'rgba(255,255,255,0.62)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, 620, angle - 0.42, angle + 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(120, 130, 145, 0.08)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function isVisibleToPlayer(state: GameState, x: number, y: number, radius: number): boolean {
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (state.streetlights.some((light) => isStreetlightOn(state, light) && Math.hypot(x - light.x, y - light.y) < light.radius + radius)) return true;
  if (distance > 620 + radius) return false;
  const angleToTarget = Math.atan2(dy, dx);
  const angleDiff = Math.abs(Math.atan2(Math.sin(angleToTarget - state.player.angle), Math.cos(angleToTarget - state.player.angle)));
  if (distance > 340 && angleDiff > 0.5) return false;
  return !state.obstacles.some((obstacle) => segmentIntersectsCircle(state.player.x, state.player.y, x, y, obstacle.x, obstacle.y, obstacle.radius + 4));
}

function isStreetlightOn(state: GameState, light: { phase: number }): boolean {
  const flicker = Math.sin(state.time * 0.013 + light.phase) + Math.sin(state.time * 0.041 + light.phase * 0.37);
  return flicker > -1.05;
}

function segmentIntersectsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby) / abLenSq));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  const dx = closestX - cx;
  const dy = closestY - cy;
  return dx * dx + dy * dy < r * r;
}

function drawWeatherAndTime(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const hour = state.simulation.timeOfDay;
  const night = hour < 6 || hour > 19 ? 0.48 : hour < 8 || hour > 17 ? 0.22 : 0;
  const powerLoss = (1 - state.simulation.powerGrid) * 0.24;
  if (night + powerLoss > 0) {
    ctx.fillStyle = `rgba(4, 8, 18, ${night + powerLoss})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.simulation.weather === 'fog' || state.simulation.smoke > 0.05) {
    ctx.fillStyle = `rgba(180, 190, 185, ${state.simulation.weather === 'fog' ? 0.18 : state.simulation.smoke * 0.22})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.simulation.weather === 'rain' || state.simulation.weather === 'storm') {
    ctx.strokeStyle = state.simulation.weather === 'storm' ? 'rgba(180, 210, 255, 0.34)' : 'rgba(160, 190, 220, 0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 80; i++) {
      const x = (i * 47 + state.time * 0.8) % w;
      const y = (i * 83 + state.time * 1.6) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 8, y + 18);
      ctx.stroke();
    }
  }
}

function drawAimReticle(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== 'playing') return;
  const x = state.mouse.x;
  const y = state.mouse.y;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 18, y);
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x, y + 18);
  ctx.stroke();
  ctx.restore();
}

function drawLowHealthOverlay(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const hpRatio = state.player.hp / state.player.maxHp;
  if (hpRatio < 0.3 && state.phase === 'playing') {
    const intensity = (0.3 - hpRatio) / 0.3;
    const pulse = Math.sin(state.time * 0.005) * 0.1 + 0.9;
    ctx.fillStyle = `rgba(180, 0, 0, ${intensity * 0.35 * pulse})`;
    ctx.fillRect(0, 0, w, h);
  }
}
