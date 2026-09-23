/* TEMP DEV TOOL — the "fill details" switch under "live gen" (owner,
   2026-09-23: "with this switch the front and back label details are
   either empty or, when it is on, filled with random details — but not
   all of them: leave out, at random, the relatively optional ones like
   importer, classification, appellation or origin"). Remove before launch,
   with the live-gen switch.

   Each fill is ONE coherent wine: its grape, colour, place, appellation
   and words belong together (a random mix would put Saperavi in
   Burgundy). The optional fields are then dropped at random. */

type Wine = {
  country: string; region: string; appellations: string[]; classifications: string[];
  grapes: { name: string; colour: "Red" | "White" | "Amber" | "Rosé" }[];
  producers: string[]; names: string[]; specials: string[];
  company: string; address: string[]; web: (producer: string) => string;
};

const WINES: Wine[] = [
  {
    country: "Georgia", region: "Kakheti", appellations: ["Mukuzani", "Tsinandali", "Kindzmarauli", "Napareuli", "Kvareli"],
    classifications: ["Reserve", "Grand Reserve", "Premium"],
    grapes: [{ name: "Saperavi", colour: "Red" }, { name: "Rkatsiteli", colour: "Amber" }, { name: "Kisi", colour: "Amber" }, { name: "Mtsvane", colour: "White" }, { name: "Rkatsiteli", colour: "White" }],
    producers: ["Marani Tsinandali", "Giorgi's Marani", "Kvevri House", "Alaverdi Cellars", "Old Telavi Estate"],
    names: ["Korra", "Nana", "Mzeo", "Tsiskari", "Dila", "Ghvino"],
    specials: ["Qvevri Wine", "Qvevri Aged 6 Months", "Unfiltered", "Old Vines"],
    company: "LLC",
    address: ["#12 Chavchavadze st. 2200 Telavi, Georgia", "#5 Rustaveli st. 2400 Kvareli, Georgia"],
    web: (p) => `www.${slug(p)}.ge`,
  },
  {
    country: "France", region: "Bourgogne", appellations: ["Chablis AOC", "Pommard AOC", "Meursault AOC", "Bourgogne AOC"],
    classifications: ["Premier Cru", "Grand Cru", "Village"],
    grapes: [{ name: "Pinot Noir", colour: "Red" }, { name: "Chardonnay", colour: "White" }],
    producers: ["Domaine des Collines", "Maison Lefèvre", "Domaine du Vieux Chêne"],
    names: ["Les Pierres", "Clos Saint-Jean", "La Source", "Les Vignes Hautes"],
    specials: ["Vieilles Vignes", "Élevé en fût de chêne", "Cuvée Réservée"],
    company: "SARL",
    address: ["12 Rue des Vignes, 21200 Beaune, France", "4 Place du Marché, 89800 Chablis, France"],
    web: (p) => `www.${slug(p)}.fr`,
  },
  {
    country: "Italy", region: "Toscana", appellations: ["Chianti Classico DOCG", "Brunello di Montalcino DOCG", "Toscana IGT"],
    classifications: ["Riserva", "Gran Selezione"],
    grapes: [{ name: "Sangiovese", colour: "Red" }, { name: "Vermentino", colour: "White" }, { name: "Sangiovese", colour: "Rosé" }],
    producers: ["Castello di Poggio", "Tenuta La Quercia", "Fattoria del Sole"],
    names: ["Rosso del Colle", "Vigna Alta", "Luce di Sera", "Il Cipresso"],
    specials: ["Affinato in Botte", "Vendemmia Manuale", "Old Vines"],
    company: "S.r.l.",
    address: ["Via del Chianti 18, 53011 Castellina, Italy", "Località Poggio 4, 53024 Montalcino, Italy"],
    web: (p) => `www.${slug(p)}.it`,
  },
  {
    country: "Spain", region: "Rioja", appellations: ["Rioja DOCa", "Rioja Alavesa"],
    classifications: ["Crianza", "Reserva", "Gran Reserva"],
    grapes: [{ name: "Tempranillo", colour: "Red" }, { name: "Garnacha", colour: "Rosé" }, { name: "Viura", colour: "White" }],
    producers: ["Bodegas Monte Viejo", "Viñedos del Norte", "Bodega La Ermita"],
    names: ["Tierra Roja", "El Camino", "Piedra Alta", "Sol de Otoño"],
    specials: ["Hand Harvested", "12 Months in Oak", "Old Vines"],
    company: "S.L.",
    address: ["Calle Mayor 22, 26200 Haro, Spain"],
    web: (p) => `www.${slug(p)}.es`,
  },
];

const DESCRIPTIONS: Record<string, string[]> = {
  Red: [
    "A deep, medium-bodied red with aromas of black cherry, plum and a touch of spice. Firm tannins and a long, savoury finish.",
    "Ruby red with notes of wild berries and dried herbs; fresh acidity and soft tannins carry a smooth, lingering finish.",
  ],
  White: [
    "Pale straw with aromas of green apple, citrus and white flowers. Crisp, clean and mineral, with a bright finish.",
    "A fresh, elegant white with notes of pear and lemon peel, a light touch of oak and a saline finish.",
  ],
  Amber: [
    "Skin-contact amber wine with aromas of dried apricot, quince and walnut. Textured, gently tannic, with a long earthy finish.",
    "Deep amber, fermented on its skins in qvevri: orange peel, honey and wild herbs, with firm grip and bright acidity.",
  ],
  "Rosé": [
    "Pale salmon-pink with aromas of strawberry, red currant and rose petal. Dry, crisp and refreshing.",
    "A delicate dry rosé with notes of raspberry and citrus, light-bodied with a clean mineral finish.",
  ],
};
const IMPORTERS = [['"Teller Wines" LLC', "148 W 68 st. 10023 NYC, USA"], ['"Nordic Cellars" AB', "Sveavägen 12, 111 57 Stockholm, Sweden"], ['"Vino & Co" GmbH', "Weinstraße 5, 10115 Berlin, Germany"]];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/* "Maison Lefèvre" → "maisonlefevre" (the accent goes, its letter stays) */
const slug = (p: string) => p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const maybe = (p = 0.55) => Math.random() < p;

export function randomDetails(): { front: Record<string, string>; back: Record<string, string> } {
  const w = pick(WINES);
  const g = pick(w.grapes);
  const producer = pick(w.producers);
  const year = 2016 + Math.floor(Math.random() * 9);
  const front: Record<string, string> = {
    producer,
    wine: pick(w.names),
    vintage: String(year),
    grape: g.name,
    sweetness: "Dry",
    colour: g.colour,
    wineType: "Wine",
    alcohol: pick(["11.5", "12", "12.5", "13", "13.5", "14"]),
    volume: "750",
  };
  /* the relatively optional ones — each left out at random */
  if (maybe()) front.appellation = pick(w.appellations);
  if (maybe(0.4)) front.classification = pick(w.classifications);
  if (maybe(0.65)) front.regionCountry = `${w.region}, ${w.country}`;
  if (maybe(0.45)) front.special = pick(w.specials);

  const back: Record<string, string> = {
    description: pick(DESCRIPTIONS[g.colour]),
    producerCompany: `"${producer}" ${w.company}`,   /* the front's own producer */
    producerAddress: pick(w.address),
  };
  if (maybe(0.45)) { const [imp, addr] = pick(IMPORTERS); back.importer = imp; back.importerAddress = addr; }
  if (maybe(0.6)) back.bottlingDate = `${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}/${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}/${year + 1}`;
  if (maybe(0.7)) back.lot = `L${year % 100}${String(Math.floor(Math.random() * 90000) + 10000)}`;
  if (maybe(0.6)) back.web = w.web(producer);
  return { front, back };
}
