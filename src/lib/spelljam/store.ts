import { useSyncExternalStore } from "react";
import { cloneStarter, parseBackup, type SpelljamData, type WordItem } from "./data";
import type { StyleId } from "./melody";
import { sameWord } from "./words";

const KEY = "spelljam.v1";

let state: SpelljamData = cloneStarter();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full disk — the session still works.
  }
}

function update(recipe: (current: SpelljamData) => SpelljamData) {
  state = recipe(state);
  persist();
  emit();
}

export function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = parseBackup(raw);
    if (parsed) {
      state = parsed;
      emit();
    }
  } catch {
    // Keep the starter book.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() {
  return state;
}

export function useSpelljam() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function activeSinger(data: SpelljamData) {
  return data.singers.find((s) => s.id === data.activeSingerId) ?? data.singers[0];
}

export function setActiveSinger(id: string) {
  update((s) => (s.singers.some((x) => x.id === id) ? { ...s, activeSingerId: id } : s));
}

export function renameSinger(id: string, name: string) {
  update((s) => ({
    ...s,
    singers: s.singers.map((singer) =>
      singer.id === id ? { ...singer, name: name.slice(0, 24) } : singer,
    ),
  }));
}

export function setStyle(style: StyleId) {
  update((s) => ({ ...s, style }));
}

export function setVoiceOn(voiceOn: boolean) {
  update((s) => ({ ...s, voiceOn }));
}

export function setMusicOn(musicOn: boolean) {
  update((s) => ({ ...s, musicOn }));
}

export function addUnit(name: string) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return;
  const id = crypto.randomUUID();
  update((s) => ({
    ...s,
    units: [...s.units, { id, name: trimmed, words: [] }],
  }));
}

export function renameUnit(id: string, name: string) {
  update((s) => ({
    ...s,
    units: s.units.map((u) => (u.id === id ? { ...u, name: name.slice(0, 40) } : u)),
  }));
}

export function removeUnit(id: string) {
  update((s) => ({ ...s, units: s.units.filter((u) => u.id !== id) }));
}

export function moveUnit(id: string, dir: -1 | 1) {
  update((s) => {
    const i = s.units.findIndex((u) => u.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.units.length) return s;
    const units = s.units.slice();
    const [item] = units.splice(i, 1);
    units.splice(j, 0, item!);
    return { ...s, units };
  });
}

export function addWords(
  unitId: string,
  rows: { word: string; meaning: string }[],
): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  update((s) => ({
    ...s,
    units: s.units.map((u) => {
      if (u.id !== unitId) return u;
      const words = u.words.slice();
      for (const row of rows) {
        if (words.some((w) => sameWord(w.word, row.word))) {
          skipped += 1;
          continue;
        }
        const item: WordItem = {
          id: crypto.randomUUID(),
          word: row.word.slice(0, 40),
          meaning: row.meaning.slice(0, 120),
          stars: {},
          plays: {},
        };
        words.push(item);
        added += 1;
      }
      return { ...u, words };
    }),
  }));
  return { added, skipped };
}

export function setMeaning(unitId: string, wordId: string, meaning: string) {
  update((s) => ({
    ...s,
    units: s.units.map((u) =>
      u.id !== unitId
        ? u
        : {
            ...u,
            words: u.words.map((w) =>
              w.id === wordId ? { ...w, meaning: meaning.slice(0, 120) } : w,
            ),
          },
    ),
  }));
}

export function removeWord(unitId: string, wordId: string) {
  update((s) => ({
    ...s,
    units: s.units.map((u) =>
      u.id !== unitId ? u : { ...u, words: u.words.filter((w) => w.id !== wordId) },
    ),
  }));
}

export function moveWord(unitId: string, wordId: string, dir: -1 | 1) {
  update((s) => ({
    ...s,
    units: s.units.map((u) => {
      if (u.id !== unitId) return u;
      const i = u.words.findIndex((w) => w.id === wordId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= u.words.length) return u;
      const words = u.words.slice();
      const [item] = words.splice(i, 1);
      words.splice(j, 0, item!);
      return { ...u, words };
    }),
  }));
}

export function recordSong(unitId: string, wordId: string, singerId: string) {
  update((s) => ({
    ...s,
    units: s.units.map((u) =>
      u.id !== unitId
        ? u
        : {
            ...u,
            words: u.words.map((w) =>
              w.id !== wordId
                ? w
                : { ...w, plays: { ...w.plays, [singerId]: (w.plays[singerId] ?? 0) + 1 } },
            ),
          },
    ),
  }));
}

export function recordQuiz(unitId: string, wordId: string, singerId: string, stars: number) {
  const earned = Math.max(1, Math.min(3, Math.round(stars)));
  update((s) => ({
    ...s,
    units: s.units.map((u) =>
      u.id !== unitId
        ? u
        : {
            ...u,
            words: u.words.map((w) => {
              if (w.id !== wordId) return w;
              const prev = w.stars[singerId] ?? 0;
              return {
                ...w,
                stars: { ...w.stars, [singerId]: Math.max(prev, earned) },
                plays: { ...w.plays, [singerId]: (w.plays[singerId] ?? 0) + 1 },
              };
            }),
          },
    ),
  }));
}

export function replaceAll(next: SpelljamData) {
  state = next;
  persist();
  emit();
}

export function restoreSamples() {
  update((s) => {
    const names = new Set(s.units.map((u) => u.name));
    const extra = cloneStarter().units.filter((u) => !names.has(u.name));
    if (extra.length === 0) return s;
    return { ...s, units: [...s.units, ...extra] };
  });
}

export function findWord(data: SpelljamData, unitId: string, wordId: string) {
  const unit = data.units.find((u) => u.id === unitId);
  const word = unit?.words.find((w) => w.id === wordId);
  return { unit, word };
}
