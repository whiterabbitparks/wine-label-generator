/* EVALUATION SET (owner + Claude, 2026-09-18, branch POPIKA_Back_To_Vector).

   Six fixed customer briefs, run through every style on every engine
   change, so aesthetic judgement is made on the SAME inputs each time
   instead of on whatever the last customer typed. The image model has no
   seed, so a run is a sample, not a replay — the value is in comparing
   many samples of identical briefs across engine versions.

   Deliberately varied: three wine colours plus rosé and sparkling, five
   regions, all three label proportions, briefs with and without a
   producer/classification, one with a long vision and one with a bare
   noun. Keep them FROZEN — change the engine, not the questions. */

export interface EvalBrief {
  id: string;
  title: string;
  vision: string;
  data: Record<string, string>;
  /** label mm — decides landscape / portrait / square exactly as the wizard does */
  width: number;
  height: number;
}

export const EVAL_STYLES = ["traditional", "contemporary", "punk"] as const;

export const EVAL_BRIEFS: EvalBrief[] = [
  {
    id: "saperavi-qvevri",
    title: "Saperavi, qvevri, Kakheti",
    vision: "An old winemaker resting under a fig tree with his mandolin, a rooster at his feet — warm, rustic, Georgian.",
    data: {
      producer: "Popiashvili Cellars", wine: "Saperavi", appellation: "Kakheti", classification: "Qvevri",
      grape: "Saperavi", region: "Kakheti", country: "Georgia", special: "Old Vines", vintage: "2022",
      wineColorName: "Red", wineType: "Still Wine", sweetness: "Dry", alcohol: "13.5", volume: "750",
    },
    width: 110, height: 80,
  },
  {
    id: "rkatsiteli-amber",
    title: "Rkatsiteli, amber, portrait label",
    vision: "A clay qvevri buried in the earth, seen in cross-section, roots of a vine reaching down around it.",
    data: {
      producer: "", wine: "Rkatsiteli", appellation: "Kardenakhi", classification: "",
      grape: "Rkatsiteli", region: "Kakheti", country: "Georgia", special: "Skin Contact", vintage: "2023",
      wineColorName: "Amber", wineType: "Still Wine", sweetness: "Dry", alcohol: "12.5", volume: "750",
    },
    width: 80, height: 110,
  },
  {
    id: "tsolikouri-white",
    title: "Tsolikouri, white, square label",
    vision: "Morning mist over the Imereti hills, a single heron standing in a river.",
    data: {
      producer: "Baia's Wine", wine: "Tsolikouri", appellation: "Imereti", classification: "",
      grape: "Tsolikouri", region: "Imereti", country: "Georgia", special: "", vintage: "2023",
      wineColorName: "White", wineType: "Still Wine", sweetness: "Dry", alcohol: "12", volume: "750",
    },
    width: 90, height: 90,
  },
  {
    id: "chinuri-petnat",
    title: "Chinuri pét-nat, sparkling",
    vision: "Bubbles.",
    data: {
      producer: "Iago's Wine", wine: "Chinuri Pét-Nat", appellation: "Kartli", classification: "Ancestral Method",
      grape: "Chinuri", region: "Kartli", country: "Georgia", special: "Unfiltered", vintage: "2024",
      wineColorName: "White", wineType: "Sparkling Wine", sweetness: "Brut Nature", alcohol: "11.5", volume: "750",
    },
    width: 110, height: 80,
  },
  {
    id: "aleksandrouli-rose",
    title: "Aleksandrouli rosé, Racha, portrait label",
    vision: "A mountain village at dusk, stone towers, the last light on the snow above.",
    data: {
      producer: "Khvanchkara Estate", wine: "Aleksandrouli Rosé", appellation: "Racha", classification: "",
      grape: "Aleksandrouli", region: "Racha", country: "Georgia", special: "", vintage: "2024",
      wineColorName: "Rosé", wineType: "Still Wine", sweetness: "Semi-Dry", alcohol: "12", volume: "750",
    },
    width: 80, height: 110,
  },
  {
    id: "chateau-bordeaux",
    title: "Château blend, Bordeaux — the classic control",
    vision: "A stag under an oak tree at the edge of the vineyard, engraved in the manner of a nineteenth-century print.",
    data: {
      producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC", classification: "Grand Cru Classé",
      grape: "Cabernet Sauvignon", region: "Bordeaux", country: "France", special: "Vieilles Vignes", vintage: "2018",
      wineColorName: "Red", wineType: "Still Wine", sweetness: "Dry", alcohol: "12.5", volume: "750",
    },
    width: 110, height: 80,
  },
];

export function aspectOf(b: EvalBrief): "landscape" | "portrait" | "square" {
  const r = b.width / b.height;
  return r > 1.15 ? "landscape" : r < 0.87 ? "portrait" : "square";
}

/* what the owner marks on an output — the five faults from the round-77
   conversation, an overall mark, the reference it should have resembled */
export const EVAL_FAULTS = ["subject", "technique", "composition", "type", "colour"] as const;
export type EvalFault = (typeof EVAL_FAULTS)[number];

export interface EvalRating {
  faults: EvalFault[];
  score?: number;        /* 1..5 */
  ref?: string;          /* style-ref id it should have resembled */
  note?: string;
  at: string;
}

export interface EvalItem {
  id: string;            /* `${briefId}--${style}--${n}` */
  briefId: string;
  style: string;
  n: number;
  file: string;          /* png filename inside the run folder */
  prompt: string;        /* the full prompt as sent — traceability */
  card?: string | null;  /* which illustration sub-style card was dealt */
  ms: number;
  error?: string;
}

/* "label" = today's whole-label dream (type painted by the model);
   "artwork" = the hybrid's ask — illustration only, a zone left for type */
export type EvalMode = "label" | "artwork";

export interface EvalRun {
  id: string;
  name: string;
  createdAt: string;
  commit: string;
  branch: string;
  note?: string;
  mode: EvalMode;
  model: string;         /* EVAL_MODELS id; "gpt-image" for label mode */
  items: EvalItem[];
}
