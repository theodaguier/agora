import { useSyncExternalStore } from "react";

/**
 * Short interface sounds, synthesized with Web Audio: no file to load, and each one is a few soft
 * mallet notes rather than a beep. Remembered in this browser, like the theme.
 *
 * - reply: a reply you asked for has arrived (an agent's turn, a Claude Code session done).
 * - attention: something waits for you (an approval, a question, a Claude Code session waiting).
 * - message: a person wrote to you (direct message, mention, reply, task).
 * - sent: your message went out.
 * - error: a reply you asked for failed.
 */
export type Sound = "reply" | "attention" | "message" | "sent" | "error";

export const SOUNDS: Sound[] = ["reply", "attention", "message", "sent", "error"];

type Note = {
  /** Seconds after the sound starts. */
  at: number;
  freq: number;
  /** Seconds until it has faded out. */
  decay: number;
  gain?: number;
  /** Pitch it slides to over the first 60 ms (a "pop"). */
  to?: number;
};

const NOTES: Record<Sound, Note[]> = {
  // A rising fifth, A5 → E6: settled, done.
  reply: [
    { at: 0, freq: 880, decay: 0.5, gain: 0.7 },
    { at: 0.11, freq: 1318.5, decay: 0.75 },
  ],
  // E major arpeggio, E5 G#5 B5: brighter, asks for a look.
  attention: [
    { at: 0, freq: 659.25, decay: 0.4, gain: 0.75 },
    { at: 0.09, freq: 830.61, decay: 0.4, gain: 0.85 },
    { at: 0.18, freq: 987.77, decay: 0.7 },
  ],
  // A rising fourth, E5 → A5, quicker and quieter than a reply.
  message: [
    { at: 0, freq: 659.25, decay: 0.3, gain: 0.6 },
    { at: 0.08, freq: 880, decay: 0.45, gain: 0.75 },
  ],
  sent: [{ at: 0, freq: 520, to: 780, decay: 0.12, gain: 0.45 }],
  // A falling third, E4 → C4, low and short.
  error: [
    { at: 0, freq: 329.63, decay: 0.25, gain: 0.7 },
    { at: 0.12, freq: 261.63, decay: 0.4, gain: 0.7 },
  ],
};

/** Harmonics of each note (multiple, level, share of its decay): an octave and two that die fast. */
const PARTIALS = [
  [1, 1, 1],
  [2, 0.16, 0.45],
  [4, 0.05, 0.2],
] as const;

export type SoundPrefs = { enabled: boolean; volume: number };

const STORAGE_KEY = "agora.sounds";
const DEFAULTS: SoundPrefs = { enabled: true, volume: 0.6 };

function stored(): SoundPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SoundPrefs> | null;
    if (value && typeof value === "object")
      return {
        enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
        volume: typeof value.volume === "number" ? Math.min(1, Math.max(0, value.volume)) : DEFAULTS.volume,
      };
  } catch {}
  return DEFAULTS;
}

let prefs = stored();
const listeners = new Set<() => void>();

export function setSoundPrefs(next: Partial<SoundPrefs>) {
  prefs = { ...prefs, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
  listeners.forEach((l) => l());
}

export const useSoundPrefs = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Created on a click or a key press: browsers keep an AudioContext started without one silent. */
function context() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);
    // A short, dark echo under the dry notes: some room instead of a dead beep.
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.13;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2800;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    master.connect(delay);
    delay.connect(tone).connect(feedback).connect(delay);
    tone.connect(wet).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

const unlock = () => {
  if (prefs.enabled) context();
};
window.addEventListener("pointerdown", unlock, { capture: true });
window.addEventListener("keydown", unlock, { capture: true });

/**
 * Whether the context can play now. A context still suspended would play the notes on its next
 * resume, long after the event, so a resume that does not come at once means silence.
 */
async function running() {
  if (ctx?.state === "suspended") await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 150))]);
  return ctx?.state === "running";
}

function render(sound: Sound) {
  if (!ctx || !master || ctx.state !== "running") return;
  // Loudness grows with the square of the gain: the slider's middle sounds like the middle.
  master.gain.value = prefs.volume ** 2 * 0.5;
  const t0 = ctx.currentTime + 0.01;
  for (const note of NOTES[sound]) {
    for (const [multiple, level, share] of PARTIALS) {
      const start = t0 + note.at;
      const end = start + note.decay * share;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(note.freq * multiple, start);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to * multiple, start + 0.06);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime((note.gain ?? 1) * level, start + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(master);
      osc.start(start);
      osc.stop(end + 0.05);
    }
  }
}

/**
 * Same sound again within this delay: dropped (a burst of messages rings once). Any sound within
 * the shorter one too: an event the stream and the inbox both report (a reply in a group) rings once.
 */
const REPEAT_MS = 800;
const GAP_MS = 600;
const last: Partial<Record<Sound, number>> = {};
let lastAny = 0;

/** Events every open tab receives ring in one only: the first to claim their key. */
const CLAIMS_KEY = "agora.sounds.claims";
const CLAIM_MS = 10_000;

async function claim(key: string) {
  if (!navigator.locks) return true;
  return navigator.locks.request(CLAIMS_KEY, () => {
    try {
      const now = Date.now();
      const claims = Object.fromEntries(
        Object.entries(JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? "{}") as Record<string, number>).filter(([, at]) => now - at < CLAIM_MS),
      );
      if (key in claims) return false;
      localStorage.setItem(CLAIMS_KEY, JSON.stringify({ ...claims, [key]: now }));
    } catch {}
    return true;
  });
}

/**
 * Plays `sound` if sounds are on. `key` names the event it rings for, the same in every tab
 * (a message's id, a turn's), so that several open tabs ring once.
 */
export async function playSound(sound: Sound, key?: string) {
  if (!prefs.enabled) return;
  const now = Date.now();
  if (now - (last[sound] ?? 0) < REPEAT_MS || now - lastAny < GAP_MS) return;
  last[sound] = lastAny = now;
  if (key && !(await claim(`${sound}:${key}`))) return;
  if (await running()) render(sound);
}

/** Settings: plays `sound` right away, on or off (called from a click, which starts the context). */
export async function previewSound(sound: Sound) {
  context();
  if (await running()) render(sound);
}
