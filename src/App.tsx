import { useEffect, useRef, useState, useCallback } from 'react';
import { Crosshair, Pause, Play, Heart, Coins, Zap, Skull } from 'lucide-react';
import type { GameState } from '@/game/types';
import { WEAPONS, UPGRADES } from '@/game/types';
import { createInitialState, ensureStateDefaults } from '@/game/engine';
import { updateGame, startWave } from '@/game/update';
import { render } from '@/game/render';
import { fetchTopScores, submitScore, type ZombieScore } from '@/lib/supabase';
import pistolSoundUrl from '@/assets/audio/pistol.wav?url';
import smgSoundUrl from '@/assets/audio/smg.wav?url';
import shotgunSoundUrl from '@/assets/audio/shotgun.wav?url';
import rifleSoundUrl from '@/assets/audio/rifle.wav?url';
import minigunSoundUrl from '@/assets/audio/minigun.wav?url';
import zombieHitSoundUrl from '@/assets/audio/zombie-hit.wav?url';

type Screen = 'menu' | 'playing' | 'gameover' | 'leaderboard';

const SHOOT_SOUND_URLS: Record<string, string> = {
  pistol: pistolSoundUrl,
  smg: smgSoundUrl,
  shotgun: shotgunSoundUrl,
  rifle: rifleSoundUrl,
  minigun: minigunSoundUrl,
};

const SOUND_GAINS: Record<string, number> = {
  pistol: 0.72,
  smg: 0.46,
  shotgun: 0.95,
  rifle: 0.78,
  minigun: 0.4,
  zombieHit: 0.55,
};

function MobileHoldButton({ label, onPress }: { label: string; onPress: (pressed: boolean) => void }) {
  return (
    <button
      type="button"
      className="w-14 h-14 rounded-full bg-black/70 border border-white/25 text-white text-[11px] font-bold pointer-events-auto active:bg-white/20 active:scale-95"
      data-control="mobile-move"
      onPointerDown={(event) => {
        event.preventDefault();
        onPress(true);
      }}
      onPointerUp={() => onPress(false)}
      onPointerCancel={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
    >
      {label}
    </button>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [screen, setScreen] = useState<Screen>('menu');
  const [, forceUpdate] = useState(0);
  const [scores, setScores] = useState<ZombieScore[]>([]);
  const [playerName, setPlayerName] = useState('Survivor');
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const shootSoundRef = useRef<(weaponKey?: string, volume?: number) => void>(() => {});
  const hitSoundRef = useRef<(volume?: number) => void>(() => {});
  const menuAmbientRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);

  const triggerRender = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return undefined;

    const audioCtx = new AudioContextClass();
    const decodedBuffers = new Map<string, AudioBuffer>();
    audioContextRef.current = audioCtx;

    const loadSound = async (key: string, url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        decodedBuffers.set(key, await audioCtx.decodeAudioData(arrayBuffer));
      } catch (error) {
        console.warn(`Unable to load sound: ${key}`, error);
      }
    };

    void Promise.all([
      ...Object.entries(SHOOT_SOUND_URLS).map(([key, url]) => loadSound(key, url)),
      loadSound('zombieHit', zombieHitSoundUrl),
    ]);

    const playBufferedSound = (key: string, volume: number, pitch: number) => {
      const buffer = decodedBuffers.get(key);
      if (!buffer) return false;
      const now = audioCtx.currentTime;
      const source = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(pitch, now);
      gain.gain.setValueAtTime((SOUND_GAINS[key] ?? 0.6) * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(1.4, buffer.duration + 0.04));
      source.connect(gain).connect(audioCtx.destination);
      source.start(now);
      return true;
    };

    shootSoundRef.current = (weaponKey = 'pistol', volume = 1) => {
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const pitch = 0.9 + Math.random() * 0.2;
      if (playBufferedSound(weaponKey, volume, pitch)) return;

      const profile = {
        pistol: { tail: 0.13, crack: 1900, snap: 7200, body: 120, gain: 0.68, boom: 0.16 },
        smg: { tail: 0.07, crack: 2300, snap: 7600, body: 110, gain: 0.48, boom: 0.1 },
        shotgun: { tail: 0.26, crack: 900, snap: 5200, body: 72, gain: 0.95, boom: 0.36 },
        rifle: { tail: 0.17, crack: 3200, snap: 8800, body: 96, gain: 0.78, boom: 0.18 },
        minigun: { tail: 0.055, crack: 2600, snap: 7800, body: 96, gain: 0.38, boom: 0.08 },
      }[weaponKey as keyof typeof WEAPONS] ?? { tail: 0.12, crack: 2200, snap: 7600, body: 120, gain: 0.55, boom: 0.12 };

      const master = audioCtx.createGain();
      master.gain.setValueAtTime(profile.gain * volume, now);
      master.gain.exponentialRampToValueAtTime(0.001, now + profile.tail + 0.08);
      master.connect(audioCtx.destination);

      const makeNoise = (duration: number, filterType: BiquadFilterType, frequency: number, q: number, gain: number) => {
        const source = audioCtx.createBufferSource();
        const buffer = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * duration)), audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
          const t = i / data.length;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.4);
        }
        source.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(frequency, now);
        filter.Q.setValueAtTime(q, now);
        const layerGain = audioCtx.createGain();
        layerGain.gain.setValueAtTime(gain, now);
        layerGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.connect(filter).connect(layerGain).connect(master);
        source.start(now);
      };

      makeNoise(0.006, 'highpass', profile.snap * pitch, 0.7, 2.6);
      makeNoise(0.018, 'bandpass', profile.crack * pitch, 3.2, 1.8);
      makeNoise(profile.tail, 'bandpass', profile.crack * 0.34 * pitch, weaponKey === 'shotgun' ? 0.55 : 1.1, 0.58);
      makeNoise(profile.tail * 0.75, 'lowpass', (weaponKey === 'shotgun' ? 220 : 360) * pitch, 0.7, profile.boom);

      const body = audioCtx.createOscillator();
      const bodyGain = audioCtx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(profile.body * 1.8 * pitch, now);
      body.frequency.exponentialRampToValueAtTime(profile.body * pitch, now + Math.min(0.08, profile.tail));
      bodyGain.gain.setValueAtTime(profile.boom * 0.35, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(profile.tail, 0.1));
      body.connect(bodyGain).connect(master);
      body.start(now);
      body.stop(now + profile.tail);

      makeNoise(0.025, 'highpass', (weaponKey === 'shotgun' ? 950 : 1800) * pitch, 2.8, 0.1);
    };

    hitSoundRef.current = (volume = 1) => {
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const pitch = 0.94 + Math.random() * 0.12;
      if (playBufferedSound('zombieHit', volume, pitch)) return;

      const now = audioCtx.currentTime;
      const source = audioCtx.createBufferSource();
      const duration = 0.09;
      const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1);
      }
      source.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + duration);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.28 * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter).connect(gain).connect(audioCtx.destination);
      source.start(now);
    };

    return () => {
      audioCtx.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (time: number) => {
      const dt = Math.min(50, time - (lastTimeRef.current || time));
      lastTimeRef.current = time;

      const state = stateRef.current;
      ensureStateDefaults(state);
      const prevPhase = state.phase;
      updateGame(
        state,
        dt,
        (weaponKey) => {
          shootSoundRef.current?.(weaponKey);
        },
        () => {
          hitSoundRef.current?.();
        },
      );
      if (state.soundEvents.length > 0) {
        const events = state.soundEvents.splice(0, 10);
        let hitCount = 0;
        for (const event of events) {
          if (event === 'zombieHit') {
            hitCount++;
          } else {
            shootSoundRef.current?.(event, 0.38);
          }
        }
        if (hitCount > 0) {
          hitSoundRef.current?.(Math.min(1, 0.45 + hitCount * 0.08));
        }
      }

      if (prevPhase === 'playing' && state.phase === 'gameover') {
        setScreen('gameover');
        setScoreSubmitted(false);
      }

      render(ctx, state, canvas.width, canvas.height);

      if (state.phase === 'playing') {
        triggerRender();
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [triggerRender]);

  // Input handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current;
      const key = e.key.toLowerCase();
      state.keys[key] = true;

      if (key === 'escape' && state.phase === 'playing') {
        state.phase = 'paused';
        triggerRender();
      } else if (key === 'escape' && state.phase === 'paused') {
        state.phase = 'playing';
      }

      if (key >= '1' && key <= '5' && state.phase === 'playing') {
        const weaponKeys = Object.keys(WEAPONS);
        const idx = parseInt(key) - 1;
        const weaponKey = weaponKeys[idx];
        if (weaponKey && state.ownedWeapons.includes(weaponKey) && state.ammo[weaponKey] > 0) {
          state.currentWeapon = weaponKey;
        }
      }

      if ((key === '=' || key === '+') && state.phase === 'playing') {
        state.cameraZoom = Math.min(2.1, state.cameraZoom + 0.12);
        triggerRender();
      }

      if ((key === '-' || key === '_') && state.phase === 'playing') {
        state.cameraZoom = Math.max(0.75, state.cameraZoom - 0.12);
        triggerRender();
      }

      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = stateRef.current;
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) stateRef.current.mouse.down = true;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) stateRef.current.mouse.down = false;
    };

    const handleWheel = (e: WheelEvent) => {
      const state = stateRef.current;
      if (state.phase !== 'playing') return;
      e.preventDefault();
      state.cameraZoom = Math.max(0.75, Math.min(2.1, state.cameraZoom + (e.deltaY < 0 ? 0.1 : -0.1)));
      triggerRender();
    };

    const handleContext = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('contextmenu', handleContext);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('contextmenu', handleContext);
    };
  }, [triggerRender]);

  const startGame = () => {
    const state = stateRef.current;
    stateRef.current = createInitialState();
    ensureStateDefaults(stateRef.current);
    stateRef.current.phase = 'playing';
    stateRef.current.betweenWaves = true;
    stateRef.current.waveBreakTimer = 2;
    setScreen('playing');
    setShowShop(false);
  };

  const loadScores = async () => {
    const data = await fetchTopScores(15);
    setScores(data);
  };

  const handleSubmitScore = async () => {
    const state = stateRef.current;
    try {
      const success = await submitScore(playerName, state.score, state.wave, state.kills);
      if (!success) {
        localStorage.setItem('zombie_survival_scores_backup', JSON.stringify({ playerName, score: state.score, wave: state.wave, kills: state.kills }));
      }
      setScoreSubmitted(true);
      await loadScores();
    } catch (error) {
      console.error('Score submit failed, saved backup locally:', error);
      localStorage.setItem('zombie_survival_scores_backup', JSON.stringify({ playerName, score: state.score, wave: state.wave, kills: state.kills }));
      setScoreSubmitted(true);
    }
  };

  const buyWeapon = (weaponKey: string) => {
    const state = stateRef.current;
    const weapon = WEAPONS[weaponKey];
    if (state.coins >= weapon.cost && !state.ownedWeapons.includes(weaponKey)) {
      state.coins -= weapon.cost;
      state.ownedWeapons.push(weaponKey);
      state.ammo[weaponKey] = weapon.ammoPerPickup;
      state.currentWeapon = weaponKey;
      triggerRender();
    }
  };

  const buyUpgrade = (upgradeId: string) => {
    const state = stateRef.current;
    const upgrade = UPGRADES.find((u) => u.id === upgradeId)!;
    const currentLevel = state.upgradeLevels[upgradeId] ?? 0;
    if (currentLevel >= upgrade.maxLevel) return;
    const cost = upgrade.cost * (currentLevel + 1);
    if (state.coins >= cost) {
      state.coins -= cost;
      state.upgradeLevels[upgradeId] = currentLevel + 1;

      if (upgradeId === 'maxhp') {
        state.player.maxHp += 25;
        state.player.hp += 25;
      }

      triggerRender();
    }
  };

  const switchWeapon = (weaponKey: string) => {
    const state = stateRef.current;
    if (state.ownedWeapons.includes(weaponKey) && (state.ammo[weaponKey] > 0 || weaponKey === 'pistol')) {
      state.currentWeapon = weaponKey;
      triggerRender();
    }
  };

  const setVirtualKey = (key: string, pressed: boolean) => {
    stateRef.current.keys[key] = pressed;
  };

  const updateAimFromPointer = (event: React.PointerEvent) => {
    const state = stateRef.current;
    state.mouse.x = event.clientX;
    state.mouse.y = event.clientY;
  };

  const resumeGame = () => {
    stateRef.current.phase = 'playing';
    triggerRender();
  };

  const state = stateRef.current;
  ensureStateDefaults(state);
  const hpRatio = state.player.hp / state.player.maxHp;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none" style={{ cursor: screen === 'playing' && !showShop ? 'crosshair' : 'default' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return;
          updateAimFromPointer(event);
          stateRef.current.mouse.down = true;
        }}
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse') return;
          updateAimFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === 'mouse') return;
          stateRef.current.mouse.down = false;
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === 'mouse') return;
          stateRef.current.mouse.down = false;
        }}
      />

      {/* In-game HUD */}
      {screen === 'playing' && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 pointer-events-none">
            {/* Health & wave */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
                <Heart className="w-5 h-5 text-red-500" />
                <div className="w-40 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${hpRatio * 100}%`,
                      background: hpRatio > 0.5 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : hpRatio > 0.25 ? 'linear-gradient(90deg, #eab308, #facc15)' : 'linear-gradient(90deg, #dc2626, #ef4444)',
                    }}
                  />
                </div>
                <span className="text-white font-bold text-sm w-16">{Math.ceil(state.player.hp)}/{state.player.maxHp}</span>
              </div>
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
                <Skull className="w-4 h-4 text-red-500" />
                <span className="text-white font-bold text-sm">Wave {state.wave}</span>
                <span className="text-gray-500 text-xs">|</span>
                <span className="text-red-400 font-bold text-sm">{state.kills} kills</span>
              </div>
            </div>

            {/* Score & coins */}
              <div className="flex flex-col items-end gap-2">
                <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10">
                  <span className="text-gray-400 text-xs uppercase tracking-wider">Score</span>
                  <div className="text-white font-bold text-2xl leading-none">{state.score.toLocaleString()}</div>
                </div>
            </div>
          </div>

          {/* Kill streak */}
          {state.killStreak >= 5 && state.streakTimer > 0 && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-2 rounded-full border border-orange-400/50 shadow-lg shadow-orange-500/30">
                <span className="text-white font-bold text-lg tracking-wide">
                  {state.killStreak}x KILL STREAK!
                </span>
              </div>
            </div>
          )}

          {/* Wave break countdown */}
          {state.betweenWaves && state.phase === 'playing' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-red-500 font-bold text-xl uppercase tracking-widest mb-2">
                  {state.wave === 0 ? 'Get Ready' : 'Wave Cleared'}
                </div>
                <div className="text-white font-bold text-6xl drop-shadow-lg">
                  {Math.ceil(state.waveBreakTimer)}
                </div>
                <div className="text-gray-500 text-sm mt-2">Next wave incoming...</div>
              </div>
            </div>
          )}

          {/* Weapon bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-auto max-md:bottom-28 max-md:max-w-[92vw] max-md:overflow-x-auto max-md:pb-1">
            {Object.entries(WEAPONS).map(([key, weapon], idx) => {
              const owned = state.ownedWeapons.includes(key);
              const ammo = state.ammo[key];
              const isCurrent = state.currentWeapon === key;
              const canUse = owned && (key === 'pistol' || ammo > 0);
              return (
                <button
                  key={key}
                  onClick={() => canUse && switchWeapon(key)}
                  disabled={!canUse}
                  className={`relative px-2.5 py-2 rounded-lg border transition-all ${
                    isCurrent
                      ? 'bg-white/20 border-white/60 scale-110'
                      : owned
                      ? 'bg-black/60 border-white/20 hover:bg-white/10'
                      : 'bg-black/40 border-white/5 opacity-40'
                  }`}
                  style={{ minWidth: 70 }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs font-mono">{idx + 1}</span>
                    {key !== 'pistol' && owned && (
                      <span className="text-yellow-400 text-xs font-bold">{ammo}</span>
                    )}
                  </div>
                  <div className="text-white font-bold text-xs text-center mt-0.5">{weapon.name}</div>
                  {!owned && (
                    <div className="text-yellow-500 text-xs text-center mt-0.5">{weapon.cost}</div>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setShowShop(true)}
              className="px-3 py-2 rounded-lg bg-gradient-to-b from-yellow-500 to-yellow-700 border border-yellow-400 hover:from-yellow-400 hover:to-yellow-600 transition-all font-bold text-white text-sm flex items-center gap-1.5"
            >
              <Coins className="w-4 h-4" />
              SHOP
            </button>
          </div>

          {/* Pause button */}
          <button
            onClick={() => {
              stateRef.current.phase = 'paused';
              triggerRender();
            }}
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm rounded-lg p-2 border border-white/10 hover:bg-white/10 transition-all"
          >
            <Pause className="w-5 h-5 text-white" />
          </button>

          <div className="absolute bottom-28 right-4 z-20 grid grid-cols-3 grid-rows-3 gap-1.5 pointer-events-auto md:hidden" data-control="mobile-move">
            <div />
            <MobileHoldButton label="Up" onPress={(pressed) => setVirtualKey('w', pressed)} />
            <div />
            <MobileHoldButton label="Left" onPress={(pressed) => setVirtualKey('a', pressed)} />
            <div className="w-14 h-14 rounded-full border border-white/15 bg-black/45" />
            <MobileHoldButton label="Right" onPress={(pressed) => setVirtualKey('d', pressed)} />
            <div />
            <MobileHoldButton label="Down" onPress={(pressed) => setVirtualKey('s', pressed)} />
            <div />
          </div>

          <button
            type="button"
            className="absolute bottom-28 left-5 z-20 w-20 h-20 rounded-full bg-red-600/90 border-2 border-red-300/70 text-white font-black text-sm shadow-lg shadow-red-900/50 pointer-events-auto md:hidden active:scale-95"
            data-control="mobile-fire"
            onPointerDown={(event) => {
              event.preventDefault();
              updateAimFromPointer(event);
              stateRef.current.mouse.down = true;
            }}
            onPointerMove={(event) => updateAimFromPointer(event)}
            onPointerUp={() => {
              stateRef.current.mouse.down = false;
            }}
            onPointerCancel={() => {
              stateRef.current.mouse.down = false;
            }}
          >
            FIRE
          </button>
        </>
      )}

      {/* Pause overlay */}
      {state.phase === 'paused' && screen === 'playing' && (
        <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-20">
          <div className="text-center">
            <h2 className="text-white font-bold text-4xl mb-8 tracking-widest">PAUSED</h2>
            <button
              onClick={resumeGame}
              className="px-8 py-3 rounded-xl bg-gradient-to-b from-red-600 to-red-800 border border-red-500 hover:from-red-500 hover:to-red-700 transition-all font-bold text-white text-lg flex items-center gap-2 mx-auto"
            >
              <Play className="w-5 h-5" />
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Shop overlay */}
      {showShop && screen === 'playing' && (
        <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-30 p-4">
          <div className="bg-gray-900 rounded-2xl border border-white/10 max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-2xl">Armory</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-yellow-500/20 px-3 py-1.5 rounded-lg border border-yellow-500/30">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400 font-bold">{state.coins}</span>
                </div>
                <button
                  onClick={() => setShowShop(false)}
                  className="text-gray-400 hover:text-white text-2xl leading-none px-2"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Weapons */}
            <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-2">Weapons</h3>
            <div className="grid grid-cols-1 gap-2 mb-6">
              {Object.entries(WEAPONS).filter(([key]) => key !== 'pistol').map(([key, weapon]) => {
                const owned = state.ownedWeapons.includes(key);
                const canBuy = !owned && state.coins >= weapon.cost;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      owned ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div>
                      <div className="text-white font-bold">{weapon.name}</div>
                      <div className="text-gray-400 text-xs">
                        DMG {weapon.damage} | Rate {Math.round(60000 / weapon.fireRate)}rpm | Pierce {weapon.pierce}
                      </div>
                    </div>
                    {owned ? (
                      <span className="text-green-400 font-bold text-sm px-4">OWNED</span>
                    ) : (
                      <button
                        onClick={() => buyWeapon(key)}
                        disabled={!canBuy}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                          canBuy
                            ? 'bg-gradient-to-b from-yellow-500 to-yellow-700 text-white hover:from-yellow-400 hover:to-yellow-600'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {weapon.cost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Upgrades */}
            <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-2">Upgrades</h3>
            <div className="grid grid-cols-2 gap-2">
              {UPGRADES.map((upgrade) => {
                const level = state.upgradeLevels[upgrade.id] ?? 0;
                const maxed = level >= upgrade.maxLevel;
                const cost = upgrade.cost * (level + 1);
                const canBuy = !maxed && state.coins >= cost;
                return (
                  <div key={upgrade.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-white font-bold text-sm">{upgrade.name}</div>
                    <div className="text-gray-400 text-xs mb-2">{upgrade.description}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {Array.from({ length: upgrade.maxLevel }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-4 h-1.5 rounded-full ${i < level ? 'bg-green-500' : 'bg-gray-700'}`}
                          />
                        ))}
                      </div>
                      {maxed ? (
                        <span className="text-green-400 text-xs font-bold">MAX</span>
                      ) : (
                        <button
                          onClick={() => buyUpgrade(upgrade.id)}
                          disabled={!canBuy}
                          className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                            canBuy
                              ? 'bg-gradient-to-b from-yellow-500 to-yellow-700 text-white hover:from-yellow-400 hover:to-yellow-600'
                              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {cost}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Menu screen */}
      {screen === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="https://images.pexels.com/photos/4888469/pexels-photo-4888469.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop"
            alt="Post-apocalyptic ruins"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <img
            src="https://cdn.pixabay.com/photo/2012/04/24/16/32/zombie-40315_1280.png"
            alt="Zombie"
            className="pointer-events-none absolute right-0 bottom-0 h-[70vh] max-h-full opacity-90 drop-shadow-[0_0_40px_rgba(0,0,0,0.75)]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />
          <div className="absolute inset-0 bg-gradient-to-t from-red-950/30 via-transparent to-transparent" />

          <div className="relative text-center max-w-md px-6 z-10">
            <div className="mb-3 flex justify-center">
              <Skull className="w-20 h-20 text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
            </div>
            <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-500 via-red-600 to-red-800 mb-1 tracking-tight drop-shadow-lg">
              ZOMBIE
            </h1>
            <h2 className="text-3xl font-bold text-gray-300 mb-8 tracking-[0.3em]">SURVIVAL</h2>

            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              The dead have risen. Survive endless waves of the undead horde. Earn coins, unlock devastating weapons, upgrade your survivor, and climb the global leaderboard.
            </p>

            <div className="mb-6">
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Survivor Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
                className="w-full px-4 py-2.5 bg-black/50 border border-red-900/40 rounded-xl text-white text-center font-bold focus:outline-none focus:border-red-500 transition-colors"
                placeholder="Enter your name..."
                onKeyDown={(e) => e.key === 'Enter' && startGame()}
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className="px-8 py-4 rounded-xl bg-gradient-to-b from-red-600 to-red-800 border border-red-500 hover:from-red-500 hover:to-red-700 transition-all font-bold text-white text-lg flex items-center justify-center gap-2 shadow-lg shadow-red-600/40"
              >
                <Crosshair className="w-6 h-6" />
                START SURVIVING
              </button>
              <button
                onClick={async () => {
                  await loadScores();
                  setScreen('leaderboard');
                }}
                className="px-8 py-3 rounded-xl bg-white/5 border border-white/20 hover:bg-white/15 transition-all font-bold text-white"
              >
                Leaderboard
              </button>
            </div>

            <div className="mt-8 text-gray-600 text-xs space-y-1">
              <p>WASD / Arrows to move | Mouse to aim and shoot</p>
              <p>1-5 to switch weapons | ESC to pause</p>
            </div>
          </div>
        </div>
      )}

      {/* Game over screen */}
      {screen === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center max-w-md px-6">
            <Skull className="w-16 h-16 text-red-600 mx-auto mb-4 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
            <h1 className="text-6xl font-black text-red-600 mb-2 drop-shadow-lg">YOU DIED</h1>
            <p className="text-gray-500 mb-6">The horde overcame you...</p>

            <div className="bg-white/5 rounded-2xl border border-red-900/30 p-6 mb-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Score</div>
                  <div className="text-white font-bold text-2xl">{state.score.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Wave</div>
                  <div className="text-white font-bold text-2xl">{state.wave}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Kills</div>
                  <div className="text-white font-bold text-2xl">{state.kills}</div>
                </div>
              </div>
            </div>

            {!scoreSubmitted ? (
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleSubmitScore}
                  className="px-8 py-3 rounded-xl bg-gradient-to-b from-yellow-500 to-yellow-700 border border-yellow-400 hover:from-yellow-400 hover:to-yellow-600 transition-all font-bold text-white flex items-center justify-center gap-2"
                >
                  <Coins className="w-5 h-5" />
                  Submit to Leaderboard
                </button>
                <button
                  onClick={startGame}
                  className="px-8 py-3 rounded-xl bg-gradient-to-b from-red-600 to-red-800 border border-red-500 hover:from-red-500 hover:to-red-700 transition-all font-bold text-white"
                >
                  Play Again
                </button>
                <button
                  onClick={() => setScreen('menu')}
                  className="px-8 py-2 text-gray-500 hover:text-white transition-colors font-bold"
                >
                  Main Menu
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-green-400 font-bold mb-2">Score submitted!</p>
                <button
                  onClick={startGame}
                  className="px-8 py-3 rounded-xl bg-gradient-to-b from-red-600 to-red-800 border border-red-500 hover:from-red-500 hover:to-red-700 transition-all font-bold text-white"
                >
                  Play Again
                </button>
                <button
                  onClick={async () => {
                    await loadScores();
                    setScreen('leaderboard');
                  }}
                  className="px-8 py-2 text-gray-500 hover:text-white transition-colors font-bold"
                >
                  View Leaderboard
                </button>
                <button
                  onClick={() => setScreen('menu')}
                  className="px-8 py-2 text-gray-500 hover:text-white transition-colors font-bold"
                >
                  Main Menu
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard screen */}
      {screen === 'leaderboard' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-950 via-black to-black">
          <div className="max-w-lg w-full px-6">
            <div className="text-center mb-6">
              <Zap className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
              <h1 className="text-4xl font-black text-white mb-1">LEADERBOARD</h1>
              <p className="text-gray-500 text-sm">Top survivors of the apocalypse</p>
            </div>

            <div className="bg-white/5 rounded-2xl border border-red-900/20 p-4 max-h-[50vh] overflow-y-auto mb-6">
              {scores.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No scores yet. Be the first!</p>
              ) : (
                <div className="space-y-1">
                  {scores.map((s, idx) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 p-3 rounded-xl ${
                        idx === 0
                          ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/30'
                          : idx < 3
                          ? 'bg-white/5'
                          : ''
                      }`}
                    >
                      <div className={`w-8 text-center font-black text-lg ${
                        idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-gray-600'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-bold">{s.player_name}</div>
                        <div className="text-gray-500 text-xs">
                          Wave {s.wave} | {s.kills} kills
                        </div>
                      </div>
                      <div className="text-yellow-400 font-bold text-lg">{s.score.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className="px-8 py-3 rounded-xl bg-gradient-to-b from-red-600 to-red-800 border border-red-500 hover:from-red-500 hover:to-red-700 transition-all font-bold text-white"
              >
                Play Now
              </button>
              <button
                onClick={() => setScreen('menu')}
                className="px-8 py-2 text-gray-500 hover:text-white transition-colors font-bold"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
