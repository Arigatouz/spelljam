/** A glyph in the spelling. Silent marks (apostrophe, hyphen) are shown, not sung. */
export type SpellToken = {
  ch: string;
  say: string | null;
  beats: number;
  index: number;
};

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tokenize(raw: string): SpellToken[] {
  const out: SpellToken[] = [];
  let sung = 0;
  for (const ch of raw.trim()) {
    if (/[a-zA-Z]/.test(ch)) {
      const lower = ch.toLowerCase();
      const say = lower === "w" ? "double U" : ch.toUpperCase();
      out.push({
        ch: ch.toUpperCase(),
        say,
        beats: lower === "w" ? 2 : 1,
        index: sung,
      });
      sung += 1;
    } else if (ch === "'" || ch === "’" || ch === "-" || ch === "–") {
      out.push({ ch: ch === "’" ? "'" : ch === "–" ? "-" : ch, say: null, beats: 0, index: -1 });
    }
  }
  return out;
}

export function lettersOnly(raw: string): string {
  return tokenize(raw)
    .filter((t) => t.say)
    .map((t) => t.ch)
    .join("");
}

export function wordBeats(raw: string): number {
  const n = lettersOnly(raw).length;
  if (n <= 5) return 2;
  if (n <= 9) return 3;
  return 4;
}

export type ParsedLine = { word: string; meaning: string };

/** One word per line. Optional meaning after a dash or colon. */
export function parseWordLines(text: string): ParsedLine[] {
  const rows: ParsedLine[] = [];
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+[—–]\s+|\s+-\s+|\s*:\s+/);
    const word = (parts[0] ?? "").trim();
    const meaning = parts.slice(1).join(" - ").trim();
    if (!/[a-zA-Z]/.test(word)) continue;
    if (lettersOnly(word).length > 24) continue;
    rows.push({ word, meaning });
  }
  return rows;
}

export function sameWord(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type BankTile = { id: string; ch: string; decoy: boolean };

export function makeBank(raw: string, salt: number): BankTile[] {
  const sung = tokenize(raw).filter((t) => t.say);
  const have = new Set(sung.map((t) => t.ch));
  const pool = ALPHABET.split("").filter((c) => !have.has(c));
  const rng = mulberry32(hashString(lettersOnly(raw).toLowerCase()) ^ salt);
  const tiles: BankTile[] = sung.map((t, i) => ({ id: `t${i}`, ch: t.ch, decoy: false }));
  const decoyCount = Math.min(3, pool.length);
  for (let n = 0; n < decoyCount; n++) {
    const i = Math.floor(rng() * pool.length);
    const ch = pool.splice(i, 1)[0];
    if (!ch) break;
    tiles.push({ id: `d${ch}${n}`, ch, decoy: true });
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = tiles[i];
    tiles[i] = tiles[j]!;
    tiles[j] = tmp!;
  }
  return tiles;
}
