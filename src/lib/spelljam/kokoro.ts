export type SpokenClip = { samples: Float32Array; rate: number };

export type VoiceLoad = {
  state: "idle" | "loading" | "ready" | "failed";
  progress: number;
};

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

let snapshot: VoiceLoad = { state: "idle", progress: 0 };
const listeners = new Set<() => void>();
const clips = new Map<string, SpokenClip>();
const pending = new Map<string, Promise<SpokenClip | null>>();

let enginePromise: Promise<import("kokoro-js").KokoroTTS | null> | null = null;

function publish(next: VoiceLoad) {
  if (next.state === snapshot.state && next.progress === snapshot.progress) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getVoiceLoad(): VoiceLoad {
  return snapshot;
}

export function subscribeVoiceLoad(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function spokenClip(text: string): SpokenClip | null {
  return clips.get(text.trim().toLowerCase()) ?? null;
}

function remember(key: string, clip: SpokenClip | null) {
  if (!clip) return;
  if (clips.size > 40) {
    const oldest = clips.keys().next().value;
    if (oldest) clips.delete(oldest);
  }
  clips.set(key, clip);
}

async function engine(): Promise<import("kokoro-js").KokoroTTS | null> {
  if (typeof window === "undefined") return null;
  if (!enginePromise) {
    publish({ state: "loading", progress: 0 });
    enginePromise = (async () => {
      try {
        const { KokoroTTS } = await import("kokoro-js");
        const tts = await KokoroTTS.from_pretrained(MODEL, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (info) => {
            const progress = "progress" in info && typeof info.progress === "number" ? info.progress : snapshot.progress;
            publish({ state: "loading", progress });
          },
        });
        publish({ state: "ready", progress: 100 });
        return tts;
      } catch (err) {
        console.warn("Clear voice unavailable, using the phone voice.", err);
        publish({ state: "failed", progress: 0 });
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

/** Speak this word with Kokoro once the model is on the device. */
export function prepareSpokenWord(text: string) {
  const key = text.trim().toLowerCase();
  const spoken = text.trim();
  if (!key || spoken.length > 80 || clips.has(key) || pending.has(key)) return;
  const job = (async () => {
    const tts = await engine();
    if (!tts) return null;
    const audio = await tts.generate(spoken, { voice: "af_heart", speed: 0.92 });
    const clip = { samples: audio.audio, rate: audio.sampling_rate };
    remember(key, clip);
    return clip;
  })().catch((err) => {
    console.warn("Could not speak", spoken, err);
    return null;
  });
  pending.set(key, job);
  void job.finally(() => pending.delete(key));
}
