import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface ZombieScore {
  id: string;
  player_name: string;
  score: number;
  wave: number;
  kills: number;
  created_at: string;
}

const LOCAL_SCORES_KEY = 'zombie_survival_scores';

function readLocalScores(): ZombieScore[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) ?? '[]') as ZombieScore[];
  } catch {
    return [];
  }
}

function writeLocalScore(playerName: string, score: number, wave: number, kills: number): void {
  const scores = readLocalScores();
  scores.push({
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    player_name: playerName.slice(0, 20) || 'Survivor',
    score,
    wave,
    kills,
    created_at: new Date().toISOString(),
  });
  localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores.sort((a, b) => b.score - a.score).slice(0, 50)));
}

export async function fetchTopScores(limit = 10): Promise<ZombieScore[]> {
  if (!supabase) {
    return readLocalScores().slice(0, limit);
  }

  const { data, error } = await supabase
    .from('zombie_scores')
    .select('id, player_name, score, wave, kills, created_at')
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch scores:', error.message);
    return [];
  }
  return (data ?? []) as ZombieScore[];
}

export async function submitScore(
  playerName: string,
  score: number,
  wave: number,
  kills: number,
): Promise<boolean> {
  if (!supabase) {
    writeLocalScore(playerName, score, wave, kills);
    return true;
  }

  const { error } = await supabase.from('zombie_scores').insert({
    player_name: playerName.slice(0, 20),
    score,
    wave,
    kills,
  });

  if (error) {
    console.error('Failed to submit score:', error.message);
    return false;
  }
  return true;
}
