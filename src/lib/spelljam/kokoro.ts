import { letterName, tokenize } from "./words";

export type SpokenClip = { samples: Float32Array; rate: number };

export type VoiceLoad = {
  state: "idle" | "loading" | "ready" | "failed";
  progress: number;
  note: string;
};

const CLIP_WAIT_MS = 60_000;

let snapshot: VoiceLoad = { state: "idle", progress: 0, note: "" };
const listeners = new Set<() => void>();
const clips = new Map<string, SpokenClip>();
const pending = new Map<string, Promise<SpokenClip | null>>();
let jobs = 0;
let nextId = 1;
let worker: Worker | null = null;
let workerFailed = false;

type WorkerMsg =
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "clip"; id: number; samples: Float32Array; rate: number }
  | { type: "error"; id: number; message: string };

const replies = new Map<number, (clip: SpokenClip | null) => void>();

function publish(next: VoiceLoad) {
  if (next.state === snapshot.state && next.progress === snapshot.progress && next.note === snapshot.note) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function noteForJobs() {
  if (snapshot.state === "loading" || snapshot.state === "failed") return;
  publish({
    ...snapshot,
    note: jobs > 0 ? "Press play. A clearer voice is still loading." : "",
  });
}

function failVoice() {
  workerFailed = true;
  publish({ state: "failed", progress: 0, note: "" });
  for (const [id, resolve] of replies) {
    replies.delete(id);
    resolve(null);
  }
}

function ensureWorker(): Worker | null {
  if (typeof window === "undefined" || workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  } catch (err) {
    console.warn("Clear voice unavailable, using the phone voice.", err);
    failVoice();
    return null;
  }
  publish({ state: "loading", progress: 0, note: "" });
  worker.onmessage = (event: MessageEvent<WorkerMsg>) => {
    const msg = event.data;
    if (msg.type === "progress") {
      publish({ state: "loading", progress: msg.progress, note: "" });
      return;
    }
    if (msg.type === "ready") {
      publish({
        state: "ready",
        progress: 100,
        note: jobs > 0 ? "Press play. A clearer voice is still loading." : "",
      });
      return;
    }
    if (msg.type === "error" && msg.id === 0) {
      console.warn("Clear voice unavailable, using the phone voice.", msg.message);
      failVoice();
      return;
    }
    const resolve = replies.get(msg.id);
    if (!resolve) return;
    replies.delete(msg.id);
    if (msg.type === "clip") resolve({ samples: msg.samples, rate: msg.rate });
    else resolve(null);
  };
  worker.onerror = (err) => {
    console.warn("Clear voice unavailable, using the phone voice.", err.message);
    failVoice();
  };
  worker.postMessage({ type: "load" });
  return worker;
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
  if (!spoken || spoken.length > 80 || workerFailed) return Promise.resolve(null);
  const voice = ensureWorker();
  if (!voice) return Promise.resolve(null);
  jobs += 1;
  noteForJobs();
  const id = nextId++;
  const job = new Promise<SpokenClip | null>((resolve) => {
    const timer = window.setTimeout(() => {
      replies.delete(id);
      resolve(null);
    }, CLIP_WAIT_MS);
    replies.set(id, (clip) => {
      window.clearTimeout(timer);
      resolve(clip);
    });
    voice.postMessage({ type: "speak", id, text: spoken });
  })
    .then((clip) => {
      remember(key, clip);
      return clip;
    })
    .catch((err) => {
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

/** Start the one-time download. Safe to call often. */
export function warmClearVoice() {
  ensureWorker();
}

/**
 * Waits briefly for clips. The song must not sit here: a slow phone
 * keeps the built-in voice and can still be tapped.
 */
export function waitForVoice(raw: string, scope: "word" | "spelling" = "spelling"): Promise<boolean> {
  const lines = voiceLines(raw);
  const wanted = scope === "word" ? lines.slice(0, 1) : lines;
  if (wanted.length === 0 || workerFailed) return Promise.resolve(false);
  if (wanted.every((line) => clips.has(line.key))) return Promise.resolve(true);
  for (const line of wanted) void prepareLine(line.key, line.spoken);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => {
      finish(wanted.every((line) => clips.has(line.key)));
    }, 1500);
    void Promise.all(wanted.map((line) => prepareLine(line.key, line.spoken))).then(() => {
      finish(wanted.every((line) => clips.has(line.key)));
    });
  });
}
