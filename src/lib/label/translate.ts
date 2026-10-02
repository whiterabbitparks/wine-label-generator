/* THE IDEA IN ENGLISH (owner, 2026-09-28: "I wrote the idea in Georgian
   and nothing of it reached the label — shouldn't it be translated
   properly and given to the engine in English?").

   It should: the idea went to the painters as typed. gpt-image reads
   Georgian only roughly, and the FLUX repaint (its T5 text encoder) not
   at all — so a Georgian story reached neither step whole. An idea in
   any non-Latin script is now translated ONCE into plain English before
   it is painted; the three columns of a run share one translation (a
   memoised promise). The visitor's own text is never shown translated —
   only the painters read it. A failed translation paints the original. */

/* 2026-10-02 (owner): EVERY idea is prepared here now, English too —
   "fix obvious typos in the prompt" ("DMT Entiry" reached the painter as
   typed), and drug themes: "let it paint psychedelic themes, but never
   show a needle being used or cocaine being snorted — psychedelic visuals
   are welcome". */
const cache = new Map<string, Promise<string>>();
const NEEDS = /[^\u0000-ɏ -⁯₠-⃏\s]/;   /* anything beyond Latin + punctuation */

async function translate(text: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return text;
  const system = [
    "You prepare a wine customer's idea for a label illustration, for an illustrator.",
    "1. If it is not in English, translate it into clear, natural English.",
    "2. Correct obvious typos and misspellings (e.g. 'Entiry' → 'Entity', 'mountin' → 'mountain') — nothing else; never reword what is spelled correctly.",
    "3. Keep every subject, animal, object, colour, place and action exactly — add nothing, explain nothing, drop nothing. Names of people, places and grapes stay as names (transliterated).",
    "4. The only exception — DRUGS, two firm rules. (a) Drug USE never stays in the text: remove every act of taking a drug — injecting, needles, syringes, snorting, lines of powder, pills, smoking drugs — and leave the people simply present in the scene. (b) When the idea names a drug or a trip (DMT, LSD, psilocybin or 'magic' mushrooms as a trip, ayahuasca, heroin, cocaine…), end with ONE added sentence describing the vision visually: psychedelic colours, kaleidoscopic patterns, luminous otherworldly beings, dreamlike transformations. (Mushrooms as a plain subject, with no trip, stay plain mushrooms.)",
    "Reply with the prepared text only.",
  ].join(" ");
  for (const model of [process.env.OPENAI_TRANSLATE_MODEL || "gpt-5.1", "gpt-4o"]) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: text }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = (j.choices?.[0]?.message?.content || "").trim();
      if (out) return out;
    } catch { /* the next model, else the original */ }
  }
  return text;
}

export function ideaInEnglish(text: string): Promise<string> {
  const t = String(text || "").trim();
  if (!t) return Promise.resolve(text);
  void NEEDS;
  let p = cache.get(t);
  if (!p) {
    p = translate(t).then((en) => {
      if (en === t) cache.delete(t);   /* a failure is not remembered */
      else console.log(`[idea] prepared: ${t.slice(0, 80)} → ${en.slice(0, 160)}`);
      return en;
    });
    cache.set(t, p);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return p;
}
