import { useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { SpelljamData } from "@/lib/spelljam/data";
import { parseBackup } from "@/lib/spelljam/data";
import {
  addUnit,
  addWords,
  moveUnit,
  moveWord,
  removeUnit,
  removeWord,
  renameSinger,
  renameUnit,
  replaceAll,
  restoreSamples,
  setMeaning,
} from "@/lib/spelljam/store";
import { parseWordLines } from "@/lib/spelljam/words";
import { BackButton, Shell } from "./ui";

export function ParentScreen({ data, onBack }: { data: SpelljamData; onBack: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Gate onBack={onBack} onOpen={() => setOpen(true)} />;
  return <Shelf data={data} onBack={onBack} />;
}

function Gate({ onBack, onOpen }: { onBack: () => void; onOpen: () => void }) {
  const [puzzle] = useState(() => {
    const a = 6 + Math.floor(Math.random() * 6);
    const b = 4 + Math.floor(Math.random() * 6);
    return { a, b, ans: a * b };
  });
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (Number(value) === puzzle.ans) onOpen();
    else setWrong(true);
  }

  return (
    <Shell>
      <BackButton onClick={onBack} label="Home" />
      <h1 className="mt-4 font-display text-4xl leading-none">Grown-up shelf</h1>
      <p className="mt-3 text-pretty text-base font-semibold text-muted">
        This is where the school words go. Kids can still open it if they know the answer — it only
        keeps the lists tidy.
      </p>
      <form onSubmit={submit} className="mt-6 rounded-3xl border border-line bg-card p-5">
        <label htmlFor="gate" className="font-display text-2xl">
          What is {puzzle.a} × {puzzle.b}?
        </label>
        <input
          id="gate"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setWrong(false);
          }}
          className="mt-3 w-full rounded-2xl border border-line bg-cream px-4 py-3 text-base font-bold text-ink"
        />
        {wrong ? <p className="mt-2 text-sm font-bold text-ink">Not quite. Try again.</p> : null}
        <button
          type="submit"
          className="lift lift-teal mt-4 w-full rounded-full bg-teal py-3 font-display text-lg text-cream"
        >
          Open the shelf
        </button>
      </form>
    </Shell>
  );
}

function Shelf({ data, onBack }: { data: SpelljamData; onBack: () => void }) {
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? "");
  const [unitName, setUnitName] = useState("");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const unit = data.units.find((item) => item.id === unitId) ?? data.units[0];

  function addBulk() {
    if (!unit) return;
    const rows = parseWordLines(draft);
    if (rows.length === 0) {
      setNote("Add one word per line. A meaning can follow a dash.");
      return;
    }
    const result = addWords(unit.id, rows);
    setDraft("");
    setNote(
      result.skipped
        ? `Added ${result.added}. Skipped ${result.skipped} already in this unit.`
        : `Added ${result.added}.`,
    );
  }

  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "spelljam-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setNote("Backup downloaded. Keep the file if you want these lists on another device.");
  }

  function onImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseBackup(String(reader.result ?? ""));
      if (!parsed) {
        setNote("That file isn't a Spelljam backup.");
        return;
      }
      replaceAll(parsed);
      setUnitId(parsed.units[0]?.id ?? "");
      setNote("Backup restored on this device.");
    };
    reader.readAsText(file);
  }

  return (
    <Shell>
      <BackButton onClick={onBack} label="Home" />
      <h1 className="mt-2 font-display text-4xl leading-none">Word shelf</h1>
      <p className="mt-2 text-pretty text-sm font-semibold text-muted">
        Type words from the book. Add a meaning in any language after a dash, so the kids see what it
        means. Lists stay on this device — there is no account and no server.
      </p>

      <section className="mt-6">
        <h2 className="font-display text-xl">Singers</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {data.singers.map((singer) => (
            <input
              key={singer.id}
              aria-label="Singer name"
              value={singer.name}
              maxLength={24}
              onChange={(event) => renameSinger(singer.id, event.target.value)}
              onBlur={(event) => renameSinger(singer.id, event.target.value.trim() || "Singer")}
              className="w-full rounded-2xl border border-line bg-card px-3 py-3 text-base font-bold text-ink"
            />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-xl">Units</h2>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = unitName.trim();
            if (!name) return;
            addUnit(name);
            setUnitName("");
            setNote(`Added ${name}.`);
          }}
        >
          <input
            value={unitName}
            onChange={(event) => setUnitName(event.target.value)}
            placeholder="Unit 4 · Food"
            maxLength={40}
            aria-label="New unit name"
            className="min-w-0 flex-1 rounded-2xl border border-line bg-card px-3 py-3 text-base text-ink"
          />
          <button
            type="submit"
            className="lift lift-teal rounded-full bg-teal px-4 font-extrabold text-cream"
          >
            Add
          </button>
        </form>
        <ul className="mt-3 flex flex-col gap-2">
          {data.units.map((item, index) => {
            const selected = unit?.id === item.id;
            return (
              <li key={item.id} className="rounded-2xl border border-line bg-card">
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => setUnitId(item.id)}
                    className={`min-w-0 flex-1 truncate px-3 py-3 text-left font-extrabold ${selected ? "text-teal" : "text-ink"}`}
                  >
                    {item.name}
                    <span className="ml-2 text-sm font-bold text-muted">{item.words.length}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Move unit up"
                    disabled={index === 0}
                    onClick={() => moveUnit(item.id, -1)}
                    className="rounded-full p-2 disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move unit down"
                    disabled={index === data.units.length - 1}
                    onClick={() => moveUnit(item.id, 1)}
                    className="rounded-full p-2 disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  {pendingDelete === item.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        removeUnit(item.id);
                        setPendingDelete(null);
                      }}
                      className="rounded-full px-2 py-2 text-sm font-extrabold text-ink"
                    >
                      Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setPendingDelete(item.id)}
                      className="rounded-full p-2"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {unit ? (
        <section className="mt-6">
          <h2 className="font-display text-xl">Words in this unit</h2>
          <input
            aria-label="Unit name"
            value={unit.name}
            maxLength={40}
            onChange={(event) => renameUnit(unit.id, event.target.value)}
            className="mt-2 w-full rounded-2xl border border-line bg-card px-3 py-3 text-base font-bold text-ink"
          />
          <label htmlFor="bulk" className="mt-3 block text-sm font-extrabold text-muted">
            One word per line. Meaning after a dash.
          </label>
          <textarea
            id="bulk"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            placeholder={"party — a fun get-together\nfriend — someone you like\nwindow"}
            className="mt-2 w-full rounded-2xl border border-line bg-card px-3 py-3 text-base text-ink"
          />
          <button
            type="button"
            onClick={addBulk}
            className="lift lift-gold mt-2 w-full rounded-full bg-gold py-3 font-display text-lg text-ink"
          >
            Add these words
          </button>
          <ul className="mt-4 flex flex-col">
            {unit.words.map((word, index) => (
              <li key={word.id} className="border-b border-line py-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-display text-xl">{word.word}</p>
                  <button
                    type="button"
                    aria-label="Move word up"
                    disabled={index === 0}
                    onClick={() => moveWord(unit.id, word.id, -1)}
                    className="rounded-full p-2 disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move word down"
                    disabled={index === unit.words.length - 1}
                    onClick={() => moveWord(unit.id, word.id, 1)}
                    className="rounded-full p-2 disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${word.word}`}
                    onClick={() => removeWord(unit.id, word.id)}
                    className="rounded-full p-2"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <input
                  aria-label={`Meaning of ${word.word}`}
                  value={word.meaning}
                  maxLength={120}
                  placeholder="Meaning, any language"
                  onChange={(event) => setMeaning(unit.id, word.id, event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-line bg-cream px-3 py-2 text-base text-ink"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-6 text-sm font-semibold text-muted">Add a unit, then paste its words.</p>
      )}

      {note ? (
        <p className="mt-4 text-sm font-bold text-teal" role="status">
          {note}
        </p>
      ) : null}

      <section className="mt-8 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-display text-xl">Move lists to another device</h2>
        <p className="mt-1 text-sm font-semibold text-muted">
          A backup file is the safe way. A public website cannot hide a database password, so these
          lists are not stored online.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={download}
            className="rounded-full bg-teal py-3 text-sm font-extrabold text-cream"
          >
            Download backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-line py-3 text-sm font-extrabold"
          >
            Restore backup
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => {
            restoreSamples();
            setNote("Sample units are back, if they were missing.");
          }}
          className="mt-3 text-sm font-extrabold text-muted"
        >
          Put the sample units back
        </button>
      </section>
    </Shell>
  );
}
