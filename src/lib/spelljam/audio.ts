import { composeSong, type SongChart, type SongEvent, type StyleId } from "./melody";

type Hooks = {
  onEvent?: (event: SongEvent) => void;
  onEnd?: () => void;
};

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let primed = false;
let currentStop: (() => void) | null = null;
let voicePick: SpeechSynthesisVoice | null = null;
const live: { stop: (when: number) => void }[] = [];

function stopVoices() {
  if (!ctx) {
    live.length = 0;
    return;
  }
  const when = ctx.currentTime + 0.02;
  for (const voice of live) voice.stop(when);
  live.length = 0;
}

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

function getCtx(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(master);
    const seconds = Math.floor(ctx.sampleRate * 0.3);
    noise = ctx.createBuffer(1, seconds, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < seconds; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return voicePick;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  voicePick =
    en.find((v) => /samantha|google uk english female|karen|moira|serena|female/i.test(v.name)) ??
    en[0] ??
    voices[0] ??
    null;
  return voicePick;
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => unlockAudio(), { once: false });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx?.state === "suspended") void ctx.resume();
  });
  window.speechSynthesis?.addEventListener("voiceschanged", () => pickVoice());
}

/** Call synchronously inside a tap or click so iOS will allow sound. */
export function unlockAudio() {
  try {
    const audio = getCtx();
    if (audio && audio.state === "suspended") void audio.resume();
    if (!primed && typeof window !== "undefined" && window.speechSynthesis) {
      primed = true;
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0.01;
      primer.rate = 2;
      window.speechSynthesis.speak(primer);
    }
  } catch {
    // Audio can be blocked until the next tap.
  }
}

function midiHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function track(node: OscillatorNode | AudioBufferSourceNode) {
  const item = {
    stop(when: number) {
      try {
        node.stop(when);
      } catch {
        // already stopped
      }
    },
  };
  live.push(item);
  node.onended = () => {
    const i = live.indexOf(item);
    if (i >= 0) live.splice(i, 1);
    try {
      node.disconnect();
    } catch {
      // already disconnected
    }
  };
}

function gainEnv(audio: AudioContext, when: number, dur: number, peak: number) {
  const g = audio.createGain();
  const attack = Math.min(0.03, Math.max(0.01, dur * 0.18));
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, attack + 0.04));
  return g;
}

function tone(
  audio: AudioContext,
  dest: AudioNode,
  when: number,
  midi: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  vibrato: boolean,
) {
  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(midiHz(midi), when);
  const g = gainEnv(audio, when, dur, peak);
  if (vibrato) {
    const lfo = audio.createOscillator();
    const depth = audio.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.value = 5;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(when);
    lfo.stop(when + dur + 0.05);
    lfo.onended = () => {
      try {
        lfo.disconnect();
        depth.disconnect();
      } catch {
        // ignore
      }
    };
  }
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.06);
  track(osc);
  return osc;
}

function kick(audio: AudioContext, dest: AudioNode, when: number, soft: boolean) {
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(soft ? 120 : 156, when);
  osc.frequency.exponentialRampToValueAtTime(48, when + 0.09);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(soft ? 0.28 : 0.55, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + 0.22);
  track(osc);
}

function clap(audio: AudioContext, dest: AudioNode, when: number, peak: number) {
  if (!noise) return;
  const src = audio.createBufferSource();
  src.buffer = noise;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(when);
  src.stop(when + 0.14);
  track(src);
}

function speak(text: string, midi: number, durSec: number) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.pitch = Math.min(1.7, Math.max(0.75, 0.9 + (midi - 60) * 0.04));
    const estimated = Math.min(1.8, 0.32 + text.length * 0.05);
    utter.rate = Math.min(1.25, Math.max(0.84, estimated / Math.max(0.35, durSec * 0.92)));
    // cancel() on some browsers drops the next utterance unless it is deferred a frame.
    window.setTimeout(() => {
      try {
        synth.speak(utter);
      } catch {
        // Voice missing — the tune still plays.
      }
    }, 20);
  } catch {
    // ignore
  }
}

function scheduleMusic(chart: SongChart, styleId: StyleId, leadIn: number) {
  const audio = ctx;
  const dest = musicBus;
  if (!audio || !dest) return;
  const beatSec = 60 / chart.bpm;
  const t0 = audio.currentTime + leadIn;
  const soft = styleId === "soft";
  const cheer = styleId === "cheer";
  const march = styleId === "march";

  for (let b = 0; b < chart.totalBeats; b++) {
    const swing = styleId === "bounce" && b % 2 === 1 ? 0.07 : 0;
    const when = t0 + (b + swing) * beatSec;
    if (cheer) {
      kick(audio, dest, when, false);
      clap(audio, dest, when, 0.22);
    } else if (march) {
      if (b % 2 === 0) kick(audio, dest, when, false);
      else clap(audio, dest, when, 0.16);
    } else if (soft) {
      if (b % 2 === 0) clap(audio, dest, when, 0.08);
    } else if (b % 2 === 0) kick(audio, dest, when, false);
    else clap(audio, dest, when, 0.2);

    if (b % 4 === 0) {
      tone(audio, dest, when, chart.root - 12, beatSec * 0.9, "sine", soft ? 0.08 : 0.16, false);
    }
  }

  for (const ev of chart.events) {
    const when = t0 + ev.beat * beatSec;
    const dur = ev.dur * beatSec * 0.92;
    if (ev.role === "letter") {
      tone(audio, dest, when, ev.midi, dur, soft ? "sine" : "triangle", soft ? 0.12 : 0.16, true);
      tone(audio, dest, when, ev.midi + 12, dur, "sine", 0.04, false);
    } else if (ev.role === "word") {
      const steps = [0, 4, 7];
      steps.forEach((semi, i) => {
        tone(
          audio,
          dest,
          when + i * 0.09,
          chart.root + semi,
          0.22,
          soft ? "sine" : "triangle",
          0.1,
          false,
        );
      });
      tone(audio, dest, when, ev.midi, dur, "sine", soft ? 0.08 : 0.11, true);
    }
  }
}

function arm(
  chart: SongChart,
  styleId: StyleId,
  voice: boolean,
  music: boolean,
  hooks: Hooks,
): () => void {
  const beatSec = 60 / chart.bpm;
  const leadIn = 0.08;
  let stopped = false;
  const timers: number[] = [];
  if (music) scheduleMusic(chart, styleId, leadIn);

  for (const ev of chart.events) {
    const delay = (leadIn + ev.beat * beatSec) * 1000;
    timers.push(
      window.setTimeout(() => {
        if (stopped) return;
        hooks.onEvent?.(ev);
        if (voice && ev.say) speak(ev.say, ev.midi, ev.dur * beatSec);
      }, delay),
    );
  }
  const endAt = (leadIn + chart.totalBeats * beatSec) * 1000 + 180;
  timers.push(
    window.setTimeout(() => {
      if (!stopped) hooks.onEnd?.();
    }, endAt),
  );

  return () => {
    stopped = true;
    for (const id of timers) window.clearTimeout(id);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    stopVoices();
  };
}

export function stopPlayback() {
  currentStop?.();
  currentStop = null;
  stopVoices();
}

export function playSong(
  raw: string,
  styleId: StyleId,
  opts: { slow: boolean; voice: boolean; music: boolean },
  hooks: Hooks,
): void {
  unlockAudio();
  stopPlayback();
  const chart = composeSong(raw, styleId, opts.slow);
  if (chart.events.length === 0) {
    hooks.onEnd?.();
    return;
  }
  try {
    currentStop = arm(chart, styleId, opts.voice, opts.music, {
      onEvent: hooks.onEvent,
      onEnd: () => {
        currentStop = null;
        hooks.onEnd?.();
      },
    });
  } catch {
    currentStop = null;
    hooks.onEnd?.();
  }
}

export function playWord(raw: string) {
  unlockAudio();
  stopPlayback();
  const word = raw.trim();
  if (!word) return;
  speak(word, 67, 1.1);
  const audio = ctx;
  const dest = musicBus;
  if (!audio || !dest) return;
  const when = audio.currentTime + 0.02;
  [0, 4, 7].forEach((semi, i) => {
    tone(audio, dest, when + i * 0.08, 60 + semi, 0.2, "triangle", 0.1, false);
  });
}

export function playNote(midi: number) {
  unlockAudio();
  const audio = ctx;
  const dest = musicBus;
  if (!audio || !dest) return;
  tone(audio, dest, audio.currentTime + 0.01, midi, 0.28, "triangle", 0.16, true);
}

export function playBuzz() {
  unlockAudio();
  const audio = ctx;
  const dest = musicBus;
  if (!audio || !dest) return;
  tone(audio, dest, audio.currentTime + 0.01, 42, 0.14, "square", 0.05, false);
}

export function playFanfare(root = 60) {
  unlockAudio();
  stopPlayback();
  const audio = ctx;
  const dest = musicBus;
  if (audio && dest) {
    const when = audio.currentTime + 0.02;
    [0, 4, 7, 12].forEach((semi, i) => {
      tone(audio, dest, when + i * 0.11, root + semi, 0.28, "triangle", 0.14, false);
  });
  }
}
