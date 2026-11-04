import type { StyleId } from "./melody";

export type WordItem = {
  id: string;
  word: string;
  meaning: string;
  stars: Record<string, number>;
  plays: Record<string, number>;
};

export type Unit = {
  id: string;
  name: string;
  words: WordItem[];
};

export type Singer = {
  id: string;
  name: string;
};

export type SpelljamData = {
  version: 1;
  singers: Singer[];
  activeSingerId: string;
  units: Unit[];
  style: StyleId;
  voiceOn: boolean;
  musicOn: boolean;
};

function word(
  id: string,
  text: string,
  meaning: string,
): WordItem {
  return { id, word: text, meaning, stars: {}, plays: {} };
}

export const STARTER: SpelljamData = {
  version: 1,
  singers: [
    { id: "singer-a", name: "Singer 1" },
    { id: "singer-b", name: "Singer 2" },
  ],
  activeSingerId: "singer-a",
  style: "bounce",
  voiceOn: true,
  musicOn: true,
  units: [
    {
      id: "unit-party",
      name: "Unit 1 · Party",
      words: [
        word("w-party", "party", "a fun get-together"),
        word("w-friend", "friend", "someone you like"),
        word("w-dance", "dance", "move to music"),
        word("w-music", "music", "songs and sounds"),
        word("w-cake", "cake", "a sweet birthday treat"),
        word("w-candle", "candle", "a small light"),
        word("w-gift", "gift", "something you give"),
        word("w-happy", "happy", "feeling glad"),
      ],
    },
    {
      id: "unit-school",
      name: "Unit 2 · School",
      words: [
        word("w-teacher", "teacher", "the person who helps you learn"),
        word("w-pencil", "pencil", "you write with it"),
        word("w-library", "library", "a room full of books"),
        word("w-question", "question", "something you ask"),
        word("w-answer", "answer", "what you reply"),
        word("w-homework", "homework", "school work at home"),
        word("w-project", "project", "a bigger piece of work"),
        word("w-recess", "recess", "a break to play"),
      ],
    },
    {
      id: "unit-wild",
      name: "Unit 3 · Wild words",
      words: [
        word("w-elephant", "elephant", "a huge animal with a trunk"),
        word("w-window", "window", "glass you look through"),
        word("w-beautiful", "beautiful", "really nice to see"),
        word("w-adventure", "adventure", "an exciting trip"),
        word("w-whisper", "whisper", "speak very quietly"),
        word("w-dolphin", "dolphin", "a smart animal that swims"),
        word("w-giraffe", "giraffe", "a very tall animal"),
        word("w-penguin", "penguin", "a bird that swims"),
      ],
    },
  ],
};

export function cloneStarter(): SpelljamData {
  return structuredClone(STARTER);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readNumMap(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = Math.max(0, Math.min(3, Math.round(val)));
  }
  return out;
}

function readPlays(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = Math.max(0, Math.round(val));
  }
  return out;
}

const STYLES = new Set(["bounce", "march", "soft", "cheer"]);

/** Accept a backup file. Returns null when the shape is wrong. */
export function parseBackup(raw: string): SpelljamData | null {
  if (raw.length > 500_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.singers) || data.singers.length < 1) return null;
  const singers: SpelljamData["singers"] = [];
  for (const s of data.singers) {
    if (!isRecord(s) || typeof s.id !== "string" || typeof s.name !== "string") return null;
    singers.push({ id: s.id, name: s.name.slice(0, 24) || "Singer" });
  }
  if (!Array.isArray(data.units)) return null;
  const units: Unit[] = [];
  for (const u of data.units) {
    if (!isRecord(u) || typeof u.id !== "string" || typeof u.name !== "string") return null;
    if (!Array.isArray(u.words)) return null;
    const words: WordItem[] = [];
    for (const w of u.words) {
      if (!isRecord(w) || typeof w.id !== "string" || typeof w.word !== "string") return null;
      words.push({
        id: w.id,
        word: w.word.slice(0, 40),
        meaning: typeof w.meaning === "string" ? w.meaning.slice(0, 120) : "",
        stars: readNumMap(w.stars),
        plays: readPlays(w.plays),
      });
    }
    units.push({ id: u.id, name: u.name.slice(0, 40) || "Unit", words });
  }
  const active =
    typeof data.activeSingerId === "string" && singers.some((s) => s.id === data.activeSingerId)
      ? data.activeSingerId
      : singers[0]!.id;
  const style = typeof data.style === "string" && STYLES.has(data.style) ? (data.style as StyleId) : "bounce";
  return {
    version: 1,
    singers,
    activeSingerId: active,
    units,
    style,
    voiceOn: data.voiceOn !== false,
    musicOn: data.musicOn !== false,
  };
}

export function starCount(word: WordItem, singerId: string): number {
  return word.stars[singerId] ?? 0;
}

export function unitStars(unit: Unit, singerId: string): { got: number; max: number } {
  const max = unit.words.length * 3;
  const got = unit.words.reduce((sum, w) => sum + starCount(w, singerId), 0);
  return { got, max };
}
