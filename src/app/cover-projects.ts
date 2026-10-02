/* THE HOME PAGE'S PROJECTS (owner, 2026-09-30: "make several covers like
   the Levan one from projects with a full pack — a new one on every load —
   and See how this pack was created plays the project on show"). Each is a
   real run: its idea, details, the run's three labels (traditional,
   contemporary, funky) and the one chosen, its back label (made by the
   site's own back-label service, US market), its bottle as he set it, the
   two shots, five marketing images and its product page. The cover's
   floating bottles were painted for it (gpt-image, the pack's shots in the
   old cover's pose). Pictures: public/newui/covers/<slug>/ (TSINANDALI keeps
   its first home in public/newui/home/ + demo/). */
export interface CoverProject {
  slug: string;
  home: { label: string; market1: string; market2: string; bottleFront: string; bottleBack: string };
  arrow: string;                         /* the cover's "↦" colour, from the label */
  vision: string; visionGe: string;
  front: Record<string, string>;
  back: Record<string, string>;
  desc: string;
  labels: string[]; artists: string[]; chosen: number;
  backLabel: string; shotFront: string; shotBack: string; life: string[]; landing: string; qr: string;
  bottle: { type: string; color: string; closure: string; finish: string };
  cap: number[];                         /* the closure's colour off the bottle */
  wheel?: { x: number; y: number; rgb: number[] }; shade?: number;   /* TSINANDALI's own wheel pick */
}
const T = "/newui/demo/", H = "/newui/home/";
export const COVERS: CoverProject[] = [
  {
    slug: "tsinandali",
    home: { label: H + "label.webp", market1: H + "market-1.webp", market2: H + "market-2.webp", bottleFront: H + "bottle-front.webp", bottleBack: H + "bottle-back.webp" },
    arrow: "#04bcf6",
    vision: "Soft Gravity — A human figure floating just a few centimeters above the ground, completely relaxed and unaware of it. Hair and clothes hang naturally, creating a subtle sense that gravity has softened.",
    visionGe: "რბილი გრავიტაცია — ადამიანის ფიგურა მიწიდან სულ რამდენიმე სანტიმეტრზე ლივლივებს, სრულიად მოდუნებული და ამას ვერც ამჩნევს. თმა და ტანსაცმელი ბუნებრივად ეშვება და ჩნდება მსუბუქი შეგრძნება, რომ გრავიტაცია შერბილდა.",
    front: { producer: "MARANI", wine: "TSINANDALI", appellation: "Mukuzani", classification: "", vintage: "2023", grape: "Rkatsiteli", regionCountry: "Kakheti Georgia", special: "Qvevri Wine", sweetness: "Dry", colour: "Amber", wineType: "Wine", alcohol: "12", volume: "750" },
    back: { producerCompany: "POPIKA LLC", producerAddress: "#33 Chikovani St. 0171 Tbilisi, Georgia", importer: "", importerAddress: "", bottlingDate: "22/04/23", lot: "L9876545321", web: "www.popikasmarani.com" },
    /* 2026-09-30 (owner: "no description may contradict the wine's colour"):
       an AMBER wine — its old text described a red */
    desc: "Deep amber from months on the skins in qvevri. Dried apricot, quince and walnut on the nose, a firm grip of tannin and a long, gently spiced finish.",
    labels: [T + "ts-label1.jpg", T + "ts-label2.jpg", T + "ts-label3.jpg"], artists: ["Mariam Kvashilava", "Levan Amashukeli", "Levan Amashukeli"], chosen: 1,
    backLabel: T + "ts-back-label.png", shotFront: T + "ts-shot-front.png", shotBack: T + "ts-shot-back.png", life: [1, 2, 3, 4, 5].map((n) => T + "ts-life" + n + ".jpg"), landing: T + "ts-landing.jpg", qr: "https://8k.wine/p/wqo2bp5f",
    bottle: { type: "Burgundy", color: "Olive Green", closure: "Wax Seal", finish: "Matte" }, cap: [14, 175, 255],
    wheel: { x: 0.05365, y: 0.33754, rgb: [14, 175, 255] }, shade: 0.6,
  },
  {
    slug: "el-camino",
    home: { label: "/newui/covers/el-camino/label.webp", market1: "/newui/covers/el-camino/market-1.webp", market2: "/newui/covers/el-camino/market-2.webp", bottleFront: "/newui/covers/el-camino/bottle-front.webp", bottleBack: "/newui/covers/el-camino/bottle-back.webp" },
    arrow: "#b27473",
    vision: "Deer has vine tree growing from its head like horns, it is standing at the cliff, vast landscape a far horizon on the background.",
    visionGe: "ირემს თავიდან რქებივით ვაზის ხე ამოსდის, კლდის პირას დგას, უკან ვრცელი პეიზაჟი და შორეული ჰორიზონტია.",
    front: {"producer": "Viñedos del Norte", "wine": "El Camino", "appellation": "", "classification": "", "vintage": "2019", "grape": "Viura", "regionCountry": "Rioja, Spain", "special": "", "sweetness": "Dry", "colour": "White", "wineType": "Wine", "alcohol": "11.5", "volume": "750"},
    back: {"producerCompany": "\"Viñedos del Norte\" S.L.", "producerAddress": "Calle Mayor 22, 26200 Haro, Spain", "importer": "", "importerAddress": "", "bottlingDate": "09/12/2020", "lot": "L1952328", "web": "www.vinedosdelnorte.es"},
    desc: "Pale straw with aromas of green apple, citrus and white flowers. Crisp, clean and mineral, with a bright finish.",
    labels: ["/newui/covers/el-camino/l1.jpg", "/newui/covers/el-camino/l2.jpg", "/newui/covers/el-camino/l3.jpg"], artists: ["Rati Bakradze", "Gvantsa Mzareulishvili", "Rati Bakradze"], chosen: 2,
    backLabel: "/newui/covers/el-camino/back-label.png", shotFront: "/newui/covers/el-camino/shot-front.png", shotBack: "/newui/covers/el-camino/shot-back.png", life: [1, 2, 3, 4, 5].map((n) => "/newui/covers/el-camino/life" + n + ".jpg"), landing: "/newui/covers/el-camino/landing.jpg", qr: "https://8k.wine/p/eivxk22w",
    bottle: {"type": "Burgundy", "color": "Amber", "closure": "Wax Seal", "finish": "Matte"}, cap: [156, 92, 88],
  },
  {
    slug: "les-pierres",
    home: { label: "/newui/covers/les-pierres/label.webp", market1: "/newui/covers/les-pierres/market-1.webp", market2: "/newui/covers/les-pierres/market-2.webp", bottleFront: "/newui/covers/les-pierres/bottle-front.webp", bottleBack: "/newui/covers/les-pierres/bottle-back.webp" },
    arrow: "#26538b",
    vision: "The Room Tilts — A perfectly ordinary room where the floor and horizon are gently tilted, while a relaxed figure behaves as if everything is completely normal.",
    visionGe: "ოთახი იხრება — სრულიად ჩვეულებრივი ოთახი, სადაც იატაკი და ჰორიზონტი ოდნავ დახრილია, მოდუნებული ფიგურა კი ისე იქცევა, თითქოს ყველაფერი სრულიად ნორმალურია.",
    front: {"producer": "Domaine des Collines", "wine": "Les Pierres", "appellation": "", "classification": "", "vintage": "2024", "grape": "Pinot Noir", "regionCountry": "", "special": "", "sweetness": "Dry", "colour": "Red", "wineType": "Wine", "alcohol": "11.5", "volume": "750"},
    back: {"producerCompany": "\"Domaine des Collines\" SARL", "producerAddress": "12 Rue des Vignes, 21200 Beaune, France", "importer": "\"Teller Wines\" LLC", "importerAddress": "148 W 68 St. 10023 NYC, USA", "bottlingDate": "", "lot": "L2462648", "web": ""},
    desc: "Ruby red with notes of wild berries and dried herbs; fresh acidity and soft tannins carry a smooth, lingering finish.",
    labels: ["/newui/covers/les-pierres/l1.jpg", "/newui/covers/les-pierres/l2.jpg", "/newui/covers/les-pierres/l3.jpg"], artists: ["Dachi Mindadze", "Levan Amashukeli", "Giorgi Akhuashvili"], chosen: 2,
    backLabel: "/newui/covers/les-pierres/back-label.png", shotFront: "/newui/covers/les-pierres/shot-front.png", shotBack: "/newui/covers/les-pierres/shot-back.png", life: [1, 2, 3, 4, 5].map((n) => "/newui/covers/les-pierres/life" + n + ".jpg"), landing: "/newui/covers/les-pierres/landing.jpg", qr: "https://8k.wine/p/9l95mslj",
    bottle: {"type": "Burgundy", "color": "Amber", "closure": "Cork", "finish": "Matte"}, cap: [200, 194, 137],
  },
  {
    slug: "luce-di-sera",
    home: { label: "/newui/covers/luce-di-sera/label.webp", market1: "/newui/covers/luce-di-sera/market-1.webp", market2: "/newui/covers/luce-di-sera/market-2.webp", bottleFront: "/newui/covers/luce-di-sera/bottle-front.webp", bottleBack: "/newui/covers/luce-di-sera/bottle-back.webp" },
    arrow: "#ed4a06",
    vision: "The Room Tilts — A perfectly ordinary room where the floor and horizon are gently tilted, while a relaxed figure behaves as if everything is completely normal.",
    visionGe: "ოთახი იხრება — სრულიად ჩვეულებრივი ოთახი, სადაც იატაკი და ჰორიზონტი ოდნავ დახრილია, მოდუნებული ფიგურა კი ისე იქცევა, თითქოს ყველაფერი სრულიად ნორმალურია.",
    front: {"producer": "Castello di Poggio", "wine": "Luce di Sera", "appellation": "", "classification": "Riserva", "vintage": "2020", "grape": "Sangiovese", "regionCountry": "Toscana, Italy", "special": "", "sweetness": "Dry", "colour": "Red", "wineType": "Wine", "alcohol": "13.5", "volume": "750"},
    back: {"producerCompany": "\"Castello di Poggio\" S.R.l.", "producerAddress": "Località Poggio 4, 53024 Montalcino, Italy", "importer": "", "importerAddress": "", "bottlingDate": "23/04/2021", "lot": "L2068778", "web": "www.castellodipoggio.it"},
    desc: "Ruby red with notes of wild berries and dried herbs; fresh acidity and soft tannins carry a smooth, lingering finish.",
    labels: ["/newui/covers/luce-di-sera/l1.jpg", "/newui/covers/luce-di-sera/l2.jpg", "/newui/covers/luce-di-sera/l3.jpg"], artists: ["Levan Amashukeli", "Mariam Kvashilava", "Giorgi Akhuashvili"], chosen: 0,
    backLabel: "/newui/covers/luce-di-sera/back-label.png", shotFront: "/newui/covers/luce-di-sera/shot-front.png", shotBack: "/newui/covers/luce-di-sera/shot-back.png", life: [1, 2, 3, 4, 5].map((n) => "/newui/covers/luce-di-sera/life" + n + ".jpg"), landing: "/newui/covers/luce-di-sera/landing.jpg", qr: "https://8k.wine/p/rtjuyy26",
    bottle: {"type": "Bordeaux", "color": "Olive Green", "closure": "Screw Cap", "finish": "Matte"}, cap: [213, 68, 48],
  },
  {
    slug: "mzeo",
    home: { label: "/newui/covers/mzeo/label.webp", market1: "/newui/covers/mzeo/market-1.webp", market2: "/newui/covers/mzeo/market-2.webp", bottleFront: "/newui/covers/mzeo/bottle-front.webp", bottleBack: "/newui/covers/mzeo/bottle-back.webp" },
    arrow: "#8f7fe8",
    vision: "A cat in old Tbilisi watching over the yard, seen from above, almost like a fisheye. The cat is close to the camera, as if we both look down into the yard with old Tbilisi balconies, laundry hanging on ropes across the yard, kids playing.",
    visionGe: "კატა ძველ თბილისში ეზოს დაჰყურებს, ზემოდან, თითქმის „თევზის თვალით“. კატა კამერასთან ახლოსაა, თითქოს ორივენი ერთად ვიყურებით ეზოში ძველი თბილისური აივნებით, ეზოს გადაღმა თოკებზე სარეცხი კიდია, ბავშვები თამაშობენ.",
    front: {"producer": "Giorgi's Marani", "wine": "Mzeo", "appellation": "", "classification": "", "vintage": "2020", "grape": "Saperavi", "regionCountry": "Kakheti, Georgia", "special": "Qvevri Aged 6 Months", "sweetness": "Dry", "colour": "Rosé", "wineType": "Wine", "alcohol": "13", "volume": "750"},
    back: {"producerCompany": "\"Giorgi's Marani\" LLC", "producerAddress": "#5 Rustaveli st. 2400 Kvareli, Georgia", "importer": "", "importerAddress": "", "bottlingDate": "27/11/2021", "lot": "", "web": ""},
    /* a ROSÉ — the pack's back label had described a red (owner, 2026-09-30) */
    desc: "Pale salmon pink with aromas of wild strawberry, red currant and rose petal. Fresh and dry, with a crisp, mineral finish.",
    labels: ["/newui/covers/mzeo/l1.jpg", "/newui/covers/mzeo/l2.jpg", "/newui/covers/mzeo/l3.jpg"], artists: ["Gvantsa Mzareulishvili", "Gvantsa Mzareulishvili", "Gvantsa Mzareulishvili"], chosen: 2,
    backLabel: "/newui/covers/mzeo/back-label.png", shotFront: "/newui/covers/mzeo/shot-front.png", shotBack: "/newui/covers/mzeo/shot-back.png", life: [1, 2, 3, 4, 5].map((n) => "/newui/covers/mzeo/life" + n + ".jpg"), landing: "/newui/covers/mzeo/landing.jpg", qr: "https://8k.wine/p/mzeocov01",
    bottle: {"type": "Burgundy", "color": "Transparent", "closure": "Wax Seal", "finish": "Matte"}, cap: [183, 175, 231],
  },
  {
    slug: "piedra-alta",
    home: { label: "/newui/covers/piedra-alta/label.webp", market1: "/newui/covers/piedra-alta/market-1.webp", market2: "/newui/covers/piedra-alta/market-2.webp", bottleFront: "/newui/covers/piedra-alta/bottle-front.webp", bottleBack: "/newui/covers/piedra-alta/bottle-back.webp" },
    arrow: "#c87958",
    vision: "A deer has vine tree trunks instead of horns.",
    visionGe: "ირემს რქების ნაცვლად ვაზის ტანები აქვს.",
    front: {"producer": "Bodega La Ermita", "wine": "Piedra Alta", "appellation": "Rioja Alavesa", "classification": "Reserva", "vintage": "2022", "grape": "Tempranillo", "regionCountry": "Rioja, Spain", "special": "", "sweetness": "Dry", "colour": "Red", "wineType": "Wine", "alcohol": "13.5", "volume": "750"},
    back: {"producerCompany": "\"Bodega La Ermita\" S.L.", "producerAddress": "Calle Mayor 22, 26200 Haro, Spain", "importer": "", "importerAddress": "", "bottlingDate": "", "lot": "", "web": "www.bodegalaermita.es"},
    desc: "Ruby red with notes of wild berries and dried herbs; fresh acidity and soft tannins carry a smooth, lingering finish.",
    labels: ["/newui/covers/piedra-alta/l1.jpg", "/newui/covers/piedra-alta/l2.jpg", "/newui/covers/piedra-alta/l3.jpg"], artists: ["Dachi Mindadze", "Levan Amashukeli", "Giorgi Akhuashvili"], chosen: 0,
    backLabel: "/newui/covers/piedra-alta/back-label.png", shotFront: "/newui/covers/piedra-alta/shot-front.png", shotBack: "/newui/covers/piedra-alta/shot-back.png", life: [1, 2, 3, 4, 5].map((n) => "/newui/covers/piedra-alta/life" + n + ".jpg"), landing: "/newui/covers/piedra-alta/landing.jpg", qr: "https://8k.wine/p/s9zs09j1",
    bottle: {"type": "Burgundy", "color": "Amber", "closure": "Wax Seal", "finish": "Matte"}, cap: [112, 28, 25],
  },
];
