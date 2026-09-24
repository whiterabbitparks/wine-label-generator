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
}

const RED = { x: 1284.8, y: 735.8, w: 36.1, h: 36.2 };   /* the red round button */

export const GUIDE: GuideStep[] = [
  /* ── front label details ── */
  { page: "vision", at: { x: 136, y: 342, w: 551, h: 207 }, side: "below",
    en: "Describe the picture for your label in a few words — or press “Give me an idea”.",
    ge: "რამდენიმე სიტყვით აღწერე ეტიკეტის სურათი — ან დააჭირე „მომეცი იდეა“-ს.", done: "vision" },
  { page: "vision", at: { x: 137, y: 275, w: 241, h: 34 }, side: "above",
    en: "Optional: upload a sketch or a photo to show what you mean.",
    ge: "სურვილისამებრ: ატვირთე ესკიზი ან ფოტო, რომ აჩვენო რა გინდა." },
  { page: "vision", at: { x: 891, y: 262, w: 411, h: 395 }, side: "left",
    en: "Now the label's details. Type them exactly as they should print — capitals and language stay as you type them. You don't have to fill every field: anything you leave empty simply isn't on the label.",
    ge: "ახლა ეტიკეტის დეტალები. ჩაწერე ზუსტად ისე, როგორც უნდა დაიბეჭდოს — დიდი ასოები და ენა ისე დარჩება, როგორც ჩაწერ. ყველა ველის შევსება აუცილებელი არ არის: რასაც ცარიელს დატოვებ, ეტიკეტზე უბრალოდ არ იქნება.", needs: "details" },
  { page: "vision", at: { x: 136, y: 632, w: 380, h: 30 }, side: "right",
    en: "Set your label's width and height in millimetres.",
    ge: "მიუთითე ეტიკეტის სიგანე და სიმაღლე მილიმეტრებში." },
  { page: "vision", at: RED, side: "above",
    en: "All set? Press the red button.",
    ge: "მზად ხარ? დააჭირე წითელ ღილაკს.", done: "confirm" },
  { page: "vision", at: { x: 350, y: 150, w: 740, h: 520 }, side: "right", modal: true, anchor: "create",
    en: "Check what you wrote; Edit Details takes you back if you want to change the details. Hit Create to see labels.",
    ge: "გადაამოწმე რაც ჩაწერე; რედაქტირება უკან დაგაბრუნებს, თუ დეტალების შეცვლა გინდა. დააჭირე შექმნას, რომ ეტიკეტები ნახო.", done: "page:loader" },
  /* ── painting ── */
  { page: "loader", at: { x: 620, y: 592, w: 200, h: 4 }, side: "below",
    en: "Three artists are painting right now. It takes about a minute.",
    ge: "სამი მხატვარი ახლა ხატავს. დაახლოებით ერთი წუთი დასჭირდება.", done: "page:options" },
  /* ── front label ── */
  { page: "options", at: { x: 137, y: 200, w: 1166, h: 340 }, side: "above",
    en: "Three designs, each by a different artist. Click a label to see it big — and when you like one, save it.",
    ge: "სამი დიზაინი, თითო სხვადასხვა მხატვრის. დააჭირე ეტიკეტს, რომ დიდად ნახო — და თუ რომელიმე მოგეწონა, შეინახე." },
  { page: "options", at: { x: 137, y: 637, w: 1166, h: 34 }, side: "below",
    en: "Save the one you like best.",
    ge: "შეინახე ის, რომელიც ყველაზე მეტად მოგწონს.", done: "selected" },
  { page: "options", at: RED, side: "above",
    en: "Your picture is kept for this session — only a new generation changes it. The details you can change any time. Press the red button to go on.",
    ge: "შენი სურათი ამ სესიაში შენახულია — მას მხოლოდ ახალი გენერაცია შეცვლის. დეტალების შეცვლა კი ნებისმიერ დროს შეგიძლია. გასაგრძელებლად დააჭირე წითელ ღილაკს.", done: "page:backdetails" },
  /* ── back label details ── */
  { page: "backdetails", at: { x: 136, y: 208, w: 551, h: 208 }, side: "below",
    en: "Describe your wine in a few lines — it goes on the back label.",
    ge: "რამდენიმე სტრიქონით აღწერე შენი ღვინო — ეს უკანა ეტიკეტზე დაიწერება.", needs: "backText" },
  { page: "backdetails", at: { x: 755, y: 200, w: 548, h: 215 }, side: "left",
    en: "More details about your wine. Fill in what you have — empty fields are left off.",
    ge: "მეტი დეტალი შენი ღვინის შესახებ. შეავსე რაც გაქვს — ცარიელი ველები არ დაიწერება.", needs: "backFields" },
  { page: "backdetails", at: { x: 137, y: 452, w: 550, h: 30 }, side: "above",
    en: "Have a barcode? Type its 12 or 13 digits. No barcode — leave it empty.",
    ge: "გაქვს შტრიხკოდი? ჩაწერე მისი 12 ან 13 ციფრი. თუ არ გაქვს — დატოვე ცარიელი." },
  { page: "backdetails", at: { x: 753, y: 450, w: 550, h: 34 }, side: "above",
    en: "Create a QR code and your product's web page — or upload your own QR code if you have one.",
    ge: "შექმენი QR კოდი და პროდუქტის ვებ-გვერდი — ან ატვირთე შენი QR კოდი, თუ გაქვს ასეთი." },
  { page: "backdetails", at: { x: 753, y: 653, w: 241, h: 34 }, side: "right",
    en: "Pick the markets you'll sell in — we add the legal text each one requires.",
    ge: "აირჩიე ბაზრები, სადაც გაყიდი — თითოეულისთვის საჭირო სამართლებრივ ტექსტს ჩვენ დავამატებთ.", done: "markets" },
  { page: "backdetails", at: { x: 753, y: 653, w: 241, h: 34 }, side: "right",
    en: "Now press here to confirm your choice.",
    ge: "ახლა დააჭირე აქ, რომ არჩევანი დაადასტურო.", done: "marketClosed" },
  { page: "backdetails", at: RED, side: "above",
    en: "Press the red button to build your back label.",
    ge: "დააჭირე წითელ ღილაკს, რომ უკანა ეტიკეტი აიწყოს.", done: "page:backdesign" },
  /* ── back label ── */
  { page: "backdesign", at: { x: 548.6, y: 171.5, w: 342.9, h: 342.9 }, side: "right",
    en: "Your back label is ready to print. Save it — or press Edit if you want to change something.",
    ge: "შენი უკანა ეტიკეტი ბეჭდვისთვის მზად არის. შეინახე — ან დააჭირე რედაქტირებას, თუ გინდა რამის შეცვლა.", done: "backSaved" },
  { page: "backdesign", at: RED, side: "above",
    en: "On to the bottle.",
    ge: "ახლა ბოთლი.", done: "page:bottle" },
  /* ── bottle ── */
  { page: "bottle", at: { x: 342.9, y: 171.7, w: 960, h: 412 }, side: "below",
    en: "To prepare your marketing materials, tell us what your bottle and closure look like. Your photos will show exactly what you pick.",
    ge: "სამარკეტინგო მასალა რომ მოგიმზადო, მითხარი ბოთლი და თავსახური როგორი გაქვს? ფოტოებზე ზუსტად ის გამოჩნდება, რასაც აირჩევ.", needs: "bottle" },
  { page: "bottle", at: { x: 150, y: 552, w: 180, h: 18 }, side: "right",
    en: "Have a label of your own? Upload it here — we'll make the bottle shots and marketing images with it.",
    ge: "გაქვს შენი ეტიკეტი? ატვირთე აქ — ბოთლის ფოტოებსა და სარეკლამო სურათებს მასზე გავაკეთებთ." },
  { page: "bottle", at: RED, side: "above",
    en: "Press the red button — you'll check everything before we start.",
    ge: "დააჭირე წითელ ღილაკს — დაწყებამდე ყველაფერს კიდევ ერთხელ გადახედავ.", done: "confirm" },
  { page: "bottle", at: { x: 350, y: 150, w: 740, h: 520 }, side: "right", modal: true, anchor: "create",
    en: "Check your details. If all is right, press Create — or Edit Details if you want to change something.",
    ge: "გადაამოწმე დეტალები. თუ ყველაფერი სწორია, დააჭირე შექმნას — ან რედაქტირებას, თუ რამის შეცვლა გინდა.", done: "page:assets" },
  /* ── marketing assets ── */
  { page: "assets", at: { x: 137, y: 274, w: 1165, h: 343 }, side: "above",
    en: "Two bottle photos and five marketing images{page} are being made — about two minutes in all.",
    ge: "მზადდება ბოთლის ორი ფოტო და ხუთი სარეკლამო სურათი{page} — ყველაფერს დაახლოებით ორი წუთი დასჭირდება.", done: "assetsReady" },
  { page: "assets", at: { x: 583, y: 657.6, w: 274, h: 34.3 }, side: "right",
    en: "Save them to your folder.",
    ge: "შეინახე ისინი შენს საქაღალდეში.", done: "assetsSaved" },
  { page: "assets", at: RED, side: "above",
    en: "Last step — press the red button for your Final Pack.",
    ge: "ბოლო ნაბიჯი — დააჭირე წითელ ღილაკს საბოლოო პაკეტისთვის.", done: "page:checkout" },
  /* ── final pack ── */
  { page: "checkout", at: { x: 1010, y: 660, w: 293, h: 32 }, side: "above",
    en: "Your Final Pack. Agree to the terms (press the glass), then press the red button to download. That's the whole round — well done!",
    ge: "შენი საბოლოო პაკეტი. დაეთანხმე პირობებს (დააჭირე ჭიქას) და ჩამოსატვირთად დააჭირე წითელ ღილაკს. ეს იყო მთელი რაუნდი — ყოჩაღ!" },
];
