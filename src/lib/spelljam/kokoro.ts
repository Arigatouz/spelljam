import { letterName, tokenize } from "./words";

export type SpokenClip = { samples: Float32Array; rate: number };

export type VoiceLoad = {
  state: "idle" | "loading" | "ready" | "failed";
  progress: number;
  note: string;
};

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

let snapshot: VoiceLoad = { state: "idle", progress: 0, note: "" };
const listeners = new Set<() => void>();
const clips = new Map<string, SpokenClip>();
const pending = new Map<string, Promise<SpokenClip | null>>();
let chain: Promise<unknown> = Promise.resolve();
let jobs = 0;

let enginePromise: Promise<import("kokoro-js").KokoroTTS | null> | null = null;

function publish(next: VoiceLoad) {
  if (next.state === snapshot.state && next.progress === snapshot.progress && next.note === snapshot.note) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function noteForJobs() {
  if (snapshot.state === "loading" || snapshot.state === "failed") return;
  publish({ ...snapshot, note: jobs > 0 ? "Getting the letters ready…" : "" });
}

export function getVoiceLoad(): VoiceLoad {
  return snapshot;
}

export function subscribeVoiceLoad(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function voiceStatusText(): string | null {
  if (snapshot.state === "failed") return "This phone is using its own voice.";
  if (snapshot.state === "loading") {
    return snapshot.progress > 0
      ? `Getting a clearer voice ${Math.round(snapshot.progress)}%`
      : "Getting a clearer voice…";
  }
  return snapshot.note || null;
}

export function spokenClip(key: string): SpokenClip | null {
  return clips.get(key) ?? null;
}

export function clipKey(role: "word" | "letter", say: string): string {
  if (role === "word") return `word:${say.trim().toLowerCase()}`;
  const ch = say.trim().toLowerCase() === "double u" ? "w" : say.trim().toLowerCase();
  return `letter:${ch}`;
}

function remember(key: string, clip: SpokenClip | null) {
  if (!clip) return;
  if (clips.size > 80) {
    const oldest = clips.keys().next().value;
    if (oldest) clips.delete(oldest);
  }
  clips.set(key, clip);
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function engine(): Promise<import("kokoro-js").KokoroTTS | null> {
  if (typeof window === "undefined") return null;
  if (!enginePromise) {
    publish({ state: "loading", progress: 0, note: "" });
    enginePromise = (async () => {
      try {
        const { env } = await import("@huggingface/transformers");
        const threads = typeof crossOriginIsolated === "boolean" && crossOriginIsolated ? 2 : 1;
        const wasm = env.backends.onnx.wasm;
        if (wasm) wasm.numThreads = threads;
        const { KokoroTTS } = await import("kokoro-js");
        const tts = await KokoroTTS.from_pretrained(MODEL, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (info) => {
            const progress = "progress" in info && typeof info.progress === "number" ? info.progress : snapshot.progress;
            publish({ state: "loading", progress, note: "" });
          },
        });
        publish({
          state: "ready",
          progress: 100,
          note: jobs > 0 ? "Getting the letters ready…" : "",
        });
        return tts;
      } catch (err) {
        console.warn("Clear voice unavailable, using the phone voice.", err);
        publish({ state: "failed", progress: 0, note: "" });
        return null;
      }
    })();
  }
  return enginePromise;
}

/** Start the one-time download. Safe to call often. */
export function warmClearVoice() {
  void engine();
}

function voiceLines(raw: string): { key: string; spoken: string }[] {
  const word = raw.trim();
  if (!word) return [];
  const lines = [{ key: clipKey("word", word), spoken: word }];
  const seen = new Set<string>();
  for (const token of tokenize(word)) {
    if (!token.say) continue;
    const key = clipKey("letter", token.ch);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ key, spoken: letterName(token.ch) });
  }
  return lines;
}

function prepareLine(key: string, spoken: string): Promise<SpokenClip | null> {
  const cached = clips.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  if (!spoken || spoken.length > 80) return Promise.resolve(null);
  jobs += 1;
  noteForJobs();
  const job = enqueue(async () => {
    const tts = await engine();
    if (!tts) return null;
    const audio = await tts.generate(spoken, { voice: "af_heart", speed: 0.92 });
    const clip = { samples: audio.audio, rate: audio.sampling_rate };
    remember(key, clip);
    return clip;
  }).catch((err) => {
    console.warn("Could not speak", spoken, err);
    return null;
  });
  pending.set(key, job);
  void job.finally(() => {
    jobs = Math.max(0, jobs - 1);
    pending.delete(key);
    noteForJobs();
  });
  return job;
}

/** Download the voice and speak the word plus every letter name. */
export function prepareVoice(raw: string) {
  for (const line of voiceLines(raw)) void prepareLine(line.key, line.spoken);
}

/** Resolves when the word and its letter names are spoken, or the voice cannot load. */
export async function waitForVoice(raw: string, scope: "word" | "spelling" = "spelling"): Promise<boolean> {
  const lines = voiceLines(raw);
  const wanted = scope === "word" ? lines.slice(0, 1) : lines;
  if (wanted.length === 0) return false;
  const clipsReady = await Promise.all(wanted.map((line) => prepareLine(line.key, line.spoken)));
  if (snapshot.state === "failed") return false;
  const ready = clipsReady.filter(Boolean).length;
  if (ready === 0) {
    publish({ state: "failed", progress: 0, note: "" });
    return false;
  }
  return ready === wanted.length;
}
