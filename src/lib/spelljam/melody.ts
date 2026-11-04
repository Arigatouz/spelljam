import { lettersOnly, tokenize, wordBeats, hashString, type SpellToken } from "./words";

export type StyleId = "bounce" | "march" | "soft" | "cheer";

export const STYLES: { id: StyleId; label: string; bpm: number; swing: number }[] = [
  { id: "bounce", label: "Bounce", bpm: 114, swing: 0.07 },
  { id: "march", label: "March", bpm: 100, swing: 0 },
  { id: "soft", label: "Soft", bpm: 88, swing: 0 },
  { id: "cheer", label: "Cheer", bpm: 126, swing: 0 },
];

export function styleById(id: StyleId) {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export type SongRole = "count" | "letter" | "word";

export type SongEvent = {
  beat: number;
  dur: number;
  midi: number;
  say: string | null;
  role: SongRole;
  letterIndex: number;
};

export type SongChart = {
  bpm: number;
  events: SongEvent[];
  totalBeats: number;
  root: number;
  tokens: SpellToken[];
  /** Scale degree (pentatonic index) for each sung letter. Stable for the word. */
  degrees: number[];
};

const PENTA = [0, 2, 4, 7, 9, 12, 14];
const ROOTS = [60, 62, 65, 67];
const MOTIFS: number[][] = [
  [0, 2, 4, 5, 3, 2],
  [4, 2, 0, 2, 4, 5],
  [0, 0, 2, 4, 5, 3],
  [2, 4, 5, 4, 2, 0],
  [0, 4, 3, 5, 2, 4],
  [5, 3, 2, 4, 0, 2],
];

function degreesFor(n: number, motif: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (n > 1 && i === n - 1) {
      out.push(0);
      continue;
    }
    if (n > 2 && i === n - 2) {
      out.push(2);
      continue;
    }
    out.push(motif[i % motif.length] ?? 0);
  }
  return out;
}

function keyOf(raw: string) {
  const key = lettersOnly(raw).toLowerCase();
  const seed = hashString(key || raw.trim().toLowerCase());
  const root = ROOTS[seed % ROOTS.length] ?? 60;
  const motif = MOTIFS[(seed >>> 4) % MOTIFS.length] ?? MOTIFS[0];
  return { root, motif };
}

/** The note a letter is sung on. Same every time, in every style. */
export function letterMidi(raw: string, letterIndex: number): number {
  const tokens = tokenize(raw).filter((t) => t.say);
  const { root, motif } = keyOf(raw);
  const degrees = degreesFor(tokens.length, motif);
  const deg = degrees[letterIndex] ?? 0;
  return root + (PENTA[deg] ?? 0);
}

export function composeSong(raw: string, styleId: StyleId, slow: boolean): SongChart {
  const tokens = tokenize(raw);
  const sung = tokens.filter((t) => t.say);
  const { root, motif } = keyOf(raw);
  const degrees = degreesFor(Math.max(sung.length, 1), motif);
  const style = styleById(styleId);
  const bpm = Math.round(style.bpm * (slow ? 0.8 : 1));
  const events: SongEvent[] = [];
  const spokenWord = raw.trim();

  const push = (ev: SongEvent) => events.push(ev);

  // Two claps so the body finds the beat before any letter.
  push({ beat: 0, dur: 0.4, midi: root, say: null, role: "count", letterIndex: -1 });
  push({ beat: 1, dur: 0.4, midi: root, say: null, role: "count", letterIndex: -1 });

  let beat = 2;

  const addWord = () => {
    const dur = wordBeats(raw);
    push({
      beat,
      dur,
      midi: root + 12,
      say: spokenWord,
      role: "word",
      letterIndex: -1,
    });
    beat += dur;
  };

  const addLetters = () => {
    for (const tok of sung) {
      const deg = degrees[tok.index] ?? 0;
      push({
        beat,
        dur: tok.beats,
        midi: root + (PENTA[deg] ?? 0),
        say: tok.say,
        role: "letter",
        letterIndex: tok.index,
      });
      beat += tok.beats;
    }
  };

  const letterBeats = sung.reduce((sum, t) => sum + t.beats, 0);
  const repeatSpell = letterBeats > 0 && letterBeats <= 12;

  addWord();
  addLetters();
  addWord();
  if (repeatSpell) {
    addLetters();
    addWord();
  }

  const totalBeats = Math.max(4, beat);
  return { bpm, events, totalBeats, root, tokens, degrees };
}
