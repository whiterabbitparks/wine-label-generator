/* THE GAZETTEER's starting point (branch POPIKA_Back_To_Vector,
   2026-09-19). Every painter drew Svaneti's towers for Racha: a region's
   NAME means nothing to a model — it needs what the region LOOKS like.
   These are Claude's drafts; the owner corrects them in /admin → Rules →
   Regions and the saved map (settings/_id "regions") takes over. Kept out
   of the route file because a Next route may export only its handlers. */

export const DEFAULT_REGIONS: Record<string, string> = {
  Racha: "High wooded valleys of the upper Rioni, steep forested slopes, small stone-and-timber village houses with open wooden balconies, the domed medieval church of Nikortsminda, snow on the peaks above. NOT the tall defensive towers of Svaneti — Racha has none.",
  Kakheti: "A wide, flat vineyard plain (the Alazani valley) with the long wall of the Caucasus rising in the distance, rows of vines, brick and clay farmsteads, walnut and mulberry trees, qvevri buried in earthen cellars, Alaverdi's tall cathedral. No mountain villages, no towers.",
  Imereti: "Soft green hills, river gorges and mist, dense mixed forests, tea and hazelnut groves, timber houses on stilts with wide verandas, the river Rioni. Gentle and humid — not high mountains, not dry steppe.",
  Kartli: "Rolling dry hills and a broad river valley (the Mtkvari), open sky, low ridges, old stone fortresses on hilltops, poplars along the water, vineyards on gravel terraces. Not lush, not alpine.",
  Svaneti: "High Caucasus: tall medieval stone defensive towers clustered in villages, snow peaks (Ushba), alpine meadows, deep glacial valleys. Only if the story asks for Svaneti.",
  Adjara: "Black Sea coast and steep subtropical hills — tea terraces, citrus, ferns, stone arched bridges over mountain rivers, humid green. Not vineyard plains.",
  Guria: "Low green hills near the sea, tea plantations, hazelnut orchards, timber houses with verandas, mist. Soft, humid, green.",
  Samegrelo: "Lowland plains and river marshes toward the sea, tall grasses, timber houses, lush green; Dadiani palace in Zugdidi. No mountains in the foreground.",
  Meskheti: "Dry rocky highlands, terraced hillsides cut into stone, cave monasteries (Vardzia), fortresses on cliffs, thin air and sharp light. Not green, not lowland.",
  Lechkhumi: "Small mountain valleys off the Rioni, forested slopes, terraced vineyards clinging to hills, stone village churches. Neighbour of Racha, no towers.",
};
