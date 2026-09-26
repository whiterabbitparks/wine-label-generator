/* THE GUIDED TOUR (owner, 2026-09-23): a second tutorial, the kind games
   have. The visitor does ONE whole real round with their own hands —
   types, picks, presses, and really generates — while a small black note
   beside the thing to touch says, in a few plain words, what to do there.
   Now and then a note reminds them of a rule (not every field is needed,
   everything can be edited later…). Every note can Skip the tour.
   Switched on and off with the "guided tour" dev switch; when it is off
   the demo walkthrough plays as before.

   A step belongs to a page and points at a rectangle on it (page units).
   `done` says what moves it on by itself; a step without `done` is a note
   to read, with a Next button. */

export type GuidePage = "vision" | "loader" | "options" | "backdetails" | "backdesign" | "bottle" | "assets" | "checkout";
export type GuideDone =
  | "vision"          /* three words in the idea box */
  | "selected"        /* a front label saved */
  | "markets"         /* a market picked */
  | "backSaved"       /* the back label saved */
  | "assetsReady"     /* shots and images all in */
  | "assetsSaved"     /* the images saved to the folder */
  | "confirm"         /* a check-your-details popup is open */
  | "marketClosed"    /* a market picked and the picker closed again */
  | `page:${GuidePage}`;
/* what a note to READ still expects the visitor to have done — skipping it
   with nothing done asks "are you sure?" first (owner, 2026-09-23 #10) */
export type GuideNeed = "details" | "backText" | "backFields" | "bottle";

export interface GuideStep {
  page: GuidePage;
  at: { x: number; y: number; w: number; h: number };
  side: "above" | "below" | "left" | "right";
  en: string;
  ge: string;
  done?: GuideDone;
  needs?: GuideNeed;
  /* shown over the check-your-details popup */
  modal?: boolean;
  /* placed beside the popup's own Create button (the popup's height
     changes with what it lists) */
  anchor?: "create";
  /* 2026-09-27 (owner: "you can't tell when to press Next and when a button
     moves you on"): every note says so in the same place, at its foot —
       read       → a white "Next →" (optional ones say "optional")
       action     → a pointer and the name of the button to press, which
                    itself pulses with a red ring
       wait       → "being made…" while the pictures are painted */
  wait?: boolean;
  optional?: boolean;
  press?: { en: string; ge: string };
  /* a note whose words change once the first half is done (the markets:
     pick, then confirm) */
  then?: { when: GuideDone; en: string; ge: string; press: { en: string; ge: string } };
  /* the words when a product web page is being made too (QR "create") */
  enPage?: string;
  gePage?: string;
}

const RED = { x: 1284.8, y: 735.8, w: 36.1, h: 36.2 };   /* the red round button */
const PRESS_RED = { en: "the red button", ge: "წითელი ღილაკი" };
const PRESS_SAVE = { en: "“Save”", ge: "„შენახვა“" };

export const GUIDE: GuideStep[] = [
  /* ── front label details ── */
  { page: "vision", at: { x: 136, y: 342, w: 551, h: 207 }, side: "below",
    /* 2026-09-26 (owner): an empty box is a choice too — an abstraction */
    en: "If you know what you want painted on your label, describe it in simple words. Or press “Give me an idea” — and if you leave the box empty, the artist paints an abstraction in their own style.",
    ge: "თუ იცი რა გინდა ეხატოს ეტიკეტზე, აღწერე მარტივი სიტყვებით. ან დააჭირე „მომეცი იდეა“-ს და თუ ველს ცარიელს დატოვებ, არტისტი თავის სტილში აბსტრაქციას დახატავს." },
  { page: "vision", at: { x: 137, y: 275, w: 241, h: 34 }, side: "above",
    en: "Optional: upload a sketch or a photo to show what you mean.",
    ge: "სურვილისამებრ: ატვირთე ესკიზი ან ფოტო, რომ აჩვენო რა გინდა." },
  { page: "vision", at: { x: 891, y: 262, w: 411, h: 395 }, side: "left",
    en: "Now the label's details. Type them exactly as they should print — capitals and language stay as you type them. You don't have to fill every field: anything you leave empty simply won't appear on the label.",
    ge: "ახლა ეტიკეტის დეტალები. ჩაწერე ზუსტად ისე, როგორც უნდა დაიბეჭდოს — დიდი ასოები და ენა ისე დარჩება, როგორც ჩაწერ. ყველა ველის შევსება აუცილებელი არ არის: რასაც ცარიელს დატოვებ, ეტიკეტზე უბრალოდ არ გამოჩნდება.", needs: "details" },
  { page: "vision", at: { x: 136, y: 632, w: 380, h: 30 }, side: "right",
    en: "Set your label's width and height in millimetres.",
    ge: "მიუთითე ეტიკეტის სიგანე და სიმაღლე მილიმეტრებში." },
  { page: "vision", at: RED, side: "above",
    en: "All set? Press the red button.",
    ge: "მზად ხარ? დააჭირე წითელ ღილაკს.", done: "page:loader", press: PRESS_RED },
  /* ── painting ── */
  { page: "loader", at: { x: 620, y: 592, w: 200, h: 4 }, side: "below",
    en: "Three artists are painting right now. It takes about a minute.",
    ge: "სამი არტისტი ახლა ხატავს. დაახლოებით ერთი წუთი დასჭირდება.", done: "page:options", wait: true },
  /* ── front label ── */
  { page: "options", at: { x: 137, y: 200, w: 1166, h: 340 }, side: "above",
    en: "Three designs, each in a different artist's style. Click a label to see it big, and if you like one, save it.",
    ge: "სამი დიზაინი, თითო სხვადასხვა არტისტის სტილში. დააჭირე ეტიკეტს, რომ დიდად ნახო და თუ რომელიმე მოგეწონა, შეინახე." },
  { page: "options", at: { x: 137, y: 637, w: 1166, h: 34 }, side: "below",
    en: "Save the one you like best.",
    ge: "შეინახე ის, რომელიც ყველაზე მეტად მოგწონს.", done: "selected", press: PRESS_SAVE },
  { page: "options", at: RED, side: "above",
    en: "Press the red button to go on.",
    ge: "გასაგრძელებლად დააჭირე წითელ ღილაკს.", done: "page:backdetails", press: PRESS_RED },
  /* ── back label details ── */
  { page: "backdetails", at: { x: 136, y: 208, w: 551, h: 208 }, side: "below",
    en: "Describe your wine and your winemaking in a few lines — it goes on the back label.",
    ge: "რამდენიმე სტრიქონით აღწერე შენი ღვინო, მეღვინეობა. ეს უკანა ეტიკეტზე დაიწერება.", needs: "backText" },
  { page: "backdetails", at: { x: 755, y: 200, w: 548, h: 215 }, side: "left",
    en: "A few more details about your wine. Only what you fill in will appear on the label.",
    ge: "ცოტა მეტი დეტალი შენი ღვინის შესახებ. ეტიკეტზე მხოლოდ ის ინფორმაცია გამოჩნდება, რასაც მიუთითებ.", needs: "backFields" },
  { page: "backdetails", at: { x: 137, y: 452, w: 550, h: 30 }, side: "above",
    en: "Have a barcode? Type its 12 or 13 digits. No barcode — leave it empty.",
    ge: "გაქვს შტრიხკოდი? ჩაწერე მისი 12 ან 13 ციფრი. თუ არ გაქვს — დატოვე ცარიელი." },
  { page: "backdetails", at: { x: 753, y: 450, w: 550, h: 34 }, side: "above",
    en: "Create a QR code and a product web page with the ingredients, or upload your own QR code if you have one.",
    ge: "შექმენი QR კოდი და პროდუქტის ვებ-გვერდი ინგრედიენტებით, ან ატვირთე შენი QR კოდი, თუ გაქვს ასეთი." },
  { page: "backdetails", at: { x: 753, y: 653, w: 241, h: 34 }, side: "right",
    en: "Pick the markets you'll sell in — we add the legal text each one requires.",
    ge: "აირჩიე ბაზრები, სადაც გაყიდი — თითოეულისთვის საჭირო სამართლებრივ ტექსტს ჩვენ დავამატებთ.", done: "marketClosed",
    press: { en: "“Select Market”", ge: "„აირჩიე ბაზარი“" },
    then: { when: "markets", en: "Now press “Select” to confirm your choice.", ge: "ახლა დააჭირე „აირჩიე“-ს, რომ არჩევანი დაადასტურო.", press: { en: "“Select”", ge: "„აირჩიე“" } } },
  { page: "backdetails", at: RED, side: "above",
    en: "Press the red button to build your back label.",
    ge: "დააჭირე წითელ ღილაკს, რომ უკანა ეტიკეტი აიწყოს.", done: "page:backdesign", press: PRESS_RED },
  /* ── back label ── */
  /* 2026-09-26 (owner): beside the Save button, not the label */
  { page: "backdesign", at: { x: 548.6, y: 657.6, w: 341.4, h: 34.3 }, side: "right",
    en: "Your back label is ready to print. Save it — or press Edit if you want to change something.",
    ge: "შენი უკანა ეტიკეტი ბეჭდვისთვის მზად არის. შეინახე — ან დააჭირე რედაქტირებას, თუ გინდა რამის შეცვლა.", done: "backSaved", press: PRESS_SAVE },
  { page: "backdesign", at: RED, side: "above",
    en: "On to the bottle.",
    ge: "ახლა ბოთლი.", done: "page:bottle", press: PRESS_RED },
  /* ── bottle ── */
  { page: "bottle", at: { x: 342.9, y: 171.7, w: 960, h: 412 }, side: "below",
    en: "To prepare your marketing materials, tell us what your bottle and closure look like. Your photos will show exactly what you pick.",
    ge: "სამარკეტინგო მასალა რომ მოგიმზადო, მითხარი ბოთლი და თავსახური როგორი გაქვს? ფოტოებზე ზუსტად ის გამოჩნდება, რასაც აირჩევ.", needs: "bottle" },
  { page: "bottle", at: RED, side: "above",
    en: "Press the red button.",
    ge: "დააჭირე წითელ ღილაკს.", done: "page:assets", press: PRESS_RED },
  /* ── marketing assets ── */
  { page: "assets", at: { x: 137, y: 274, w: 1165, h: 343 }, side: "above",
    en: "Two bottle photos and five marketing images are being made — about two minutes in all.",
    ge: "მზადდება ბოთლის ორი ფოტო და ხუთი სარეკლამო სურათი — ყველაფერს დაახლოებით ორი წუთი დასჭირდება.",
    enPage: "Two bottle photos, five marketing images and your product's web page are being made — about two minutes in all.",
    gePage: "მზადდება ბოთლის ორი ფოტო, ხუთი სარეკლამო სურათი და პროდუქტის ვებ-გვერდი — ყველაფერს დაახლოებით ორი წუთი დასჭირდება.", done: "assetsReady", wait: true },
  { page: "assets", at: { x: 583, y: 657.6, w: 274, h: 34.3 }, side: "right",
    en: "Save them to your folder.",
    ge: "შეინახე ისინი შენს საქაღალდეში.", done: "assetsSaved", press: PRESS_SAVE },
  { page: "assets", at: RED, side: "above",
    en: "Last step — press the red button for your Final Pack.",
    ge: "ბოლო ნაბიჯი — დააჭირე წითელ ღილაკს საბოლოო პაკეტისთვის.", done: "page:checkout", press: PRESS_RED },
  /* ── final pack ── */
  { page: "checkout", at: { x: 1010, y: 660, w: 293, h: 32 }, side: "above",
    en: "Your Final Pack is ready. Read and agree to the terms (press the glass), and after payment press the red button to download your materials. That was the whole round — cheers!",
    ge: "შენი საბოლოო პაკეტი მზად არის. გაეცანი და დაეთანხმე პირობებს (დააჭირე ჭიქას) და გადახდის შემდეგ, მასალის ჩამოსატვირთად დააჭირე წითელ ღილაკს. ეს იყო მთელი რაუნდი, გაგვიმარჯოს!" },
];
