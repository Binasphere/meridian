"use client";

/**
 * UI sound cues, synthesised with the Web Audio API.
 *
 * No audio files: every cue is generated from oscillators, so there is nothing
 * to bundle, download, or fail to load. The AudioContext is created lazily on
 * the first cue — which is always a user gesture (pressing Buy or Sell),
 * satisfying the browser's autoplay policy — then reused, so the later
 * settlement cues (which fire without a gesture) still play.
 *
 * Everything degrades to a silent no-op where Web Audio is unavailable.
 */

let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // A context often starts "suspended" until a gesture resumes it.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOptions {
  freq: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds from now before the tone starts. */
  delay?: number;
  /** If set, glide the pitch to this frequency by the end of the tone. */
  glideTo?: number;
}

function tone(ac: AudioContext, o: ToneOptions): void {
  const start = ac.currentTime + (o.delay ?? 0);
  const end = start + o.duration;

  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(o.glideTo, end);
  }

  const peak = o.gain ?? 0.15;
  // Fast attack, exponential release — a bare gate would click.
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(end + 0.03);
}

/** A crisp two-note confirmation when a contract is placed. */
export function playPlace(): void {
  const ac = context();
  if (!ac) return;
  tone(ac, { freq: 660, duration: 0.09, type: "triangle", gain: 0.13 });
  tone(ac, { freq: 990, duration: 0.11, type: "triangle", gain: 0.11, delay: 0.07 });
}

/** A bright rising arpeggio when a contract settles in the money. */
export function playWin(): void {
  const ac = context();
  if (!ac) return;
  tone(ac, { freq: 523, duration: 0.12, gain: 0.15 }); // C5
  tone(ac, { freq: 659, duration: 0.12, gain: 0.15, delay: 0.1 }); // E5
  tone(ac, { freq: 784, duration: 0.2, gain: 0.17, delay: 0.2 }); // G5
}

/** A soft falling two-note when a contract settles out of the money. */
export function playLose(): void {
  const ac = context();
  if (!ac) return;
  tone(ac, { freq: 392, duration: 0.16, gain: 0.14, glideTo: 300 }); // G4 ↓
  tone(ac, { freq: 294, duration: 0.24, gain: 0.13, delay: 0.14, glideTo: 220 }); // D4 ↓
}

/** Neutral blip for a refunded (tie / voided) contract. */
export function playRefund(): void {
  const ac = context();
  if (!ac) return;
  tone(ac, { freq: 523, duration: 0.14, type: "sine", gain: 0.12 });
}
