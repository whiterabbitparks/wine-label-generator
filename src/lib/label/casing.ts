/* PROPER CASE (owner, 2026-09-23: "if they type a detail in lower case in
   English, make the first letter capital automatically — wine → Wine —
   wherever it has to be for the label to be grammatical; the other
   letters stay exactly as they typed them").

   Every field on a wine label is a name — a producer, a wine, a place, a
   grape, a style — so each word takes a capital, with the rules a label
   printer follows:

     · only a word that STARTS lower-case is touched, and only its first
       letter: "KORRA" stays "KORRA", "Pet-nat" stays "Pet-nat";
     · a word that already has a capital inside it ("iPhone", "McLaren")
       was typed that way on purpose, and is left;
     · the small joining words of French, Italian, Spanish, German and
       English names stay small inside a name ("Domaine de la
       Romanée-Conti", "Castello di Ama"), but not at its start;
     · Latin letters only. Georgian has no capitals in running text —
       upper-casing it would turn Mkhedruli into Mtavruli — so it and any
       other script are left alone. */

const SMALL = new Set([
  "de", "du", "des", "la", "le", "les", "l", "d", "à", "au", "aux", "en", "et", "sur", "sous",
  "di", "del", "della", "delle", "dei", "degli", "da", "dal", "e",
  "y", "do", "dos", "das",
  "van", "von", "der", "den", "zu", "am", "im", "und",
  "of", "the", "and", "on", "in", "at",
]);

/* the wine world's official marks are written in capitals whatever the
   customer typed — "mukuzani pdo" is "Mukuzani PDO" */
const MARKS = new Set(["pdo", "pgi", "aoc", "aop", "doc", "docg", "doca", "igt", "igp", "ava", "vdp", "gi", "dop", "vqa", "wo", "igt"]);
/* what follows an apostrophe in English ("Giorgi's", "don't") stays small */
const AFTER_APOSTROPHE = new Set(["s", "t", "ll", "re", "ve", "m"]);

export function properCase(s: string): string {
  let first = true;
  return s.replace(/[\p{L}\p{M}]+/gu, (w, at: number) => {
    const isFirst = first;
    first = false;
    if (!/^\p{Script=Latin}/u.test(w)) return w;
    if (MARKS.has(w.toLowerCase()) && !/\p{Lu}/u.test(w.slice(1)) && w.length <= 4) return w.toUpperCase();
    if (!/^\p{Ll}/u.test(w)) return w;
    if (/['’]/.test(s.charAt(at - 1)) && AFTER_APOSTROPHE.has(w)) return w;
    if (/\p{Lu}/u.test(w.slice(1))) return w;
    if (!isFirst && SMALL.has(w.toLowerCase())) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

/* the fields that are names; numbers, dates, lot codes and web addresses
   are never touched */
export const CASED_FIELDS = new Set([
  "producer", "wine", "appellation", "classification", "grape", "region", "country", "regionCountry",
  "special", "wineType", "colour", "wineColorName", "sweetness",
  "producerCompany", "producerAddress", "importer", "importerAddress",
]);

export function properFields<T extends object>(d: T): T {
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (CASED_FIELDS.has(k) && typeof out[k] === "string") out[k] = properCase(out[k] as string);
  return out as T;
}
