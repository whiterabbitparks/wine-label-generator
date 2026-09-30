/* THE GALLERY (owner, 2026-09-30: "add Gallery to the header before guided
   mode — a big carousel of the marketing images we have made so far, one
   per label, with a way to see only one artist's, or the ones I tick").
   One lifestyle image per label, gathered from the Final Packs downloaded
   so far and the packs on the server; the artist is the label's own
   (matched by its painting), "" where the painting is no longer on the
   server — those show under All only. Images: public/newui/gallery/. */
export interface GalleryItem { src: string; artist: string; wine: string }
export const GALLERY: GalleryItem[] = [
  {"src": "/newui/gallery/g01.jpg", "artist": "Gvantsa Mzareulishvili", "wine": "El Camino"},
  {"src": "/newui/gallery/g02.jpg", "artist": "Giorgi Akhuashvili", "wine": "Les Pierres"},
  {"src": "/newui/gallery/g03.jpg", "artist": "Rati Bakradze", "wine": "El Camino"},
  {"src": "/newui/gallery/g04.jpg", "artist": "Mariam Kvashilava", "wine": "Korra"},
  {"src": "/newui/gallery/g05.jpg", "artist": "Dachi Mindadze", "wine": "Luce di Sera"},
  {"src": "/newui/gallery/g07.jpg", "artist": "Mariam Kvashilava", "wine": "Korra"},
  {"src": "/newui/gallery/g08.jpg", "artist": "Mariam Kvashilava", "wine": "Korra"},
  {"src": "/newui/gallery/g09.jpg", "artist": "Mariam Kvashilava", "wine": "Korra"},
  {"src": "/newui/gallery/g10.jpg", "artist": "Levan Amashukeli", "wine": "Luce di Sera"},
  {"src": "/newui/gallery/g11.jpg", "artist": "Dachi Mindadze", "wine": "Piedra Alta"},
  {"src": "/newui/gallery/g12.jpg", "artist": "Levan Amashukeli", "wine": "Piedra Alta"},
  {"src": "/newui/gallery/g13.jpg", "artist": "Levan Amashukeli", "wine": "Rinandali"},
  {"src": "/newui/gallery/g14.jpg", "artist": "Giorgi Akhuashvili", "wine": "Rkatsiteli"},
  {"src": "/newui/gallery/g15.jpg", "artist": "Levan Amashukeli", "wine": "Rosso del Colle"},
  {"src": "/newui/gallery/g18.jpg", "artist": "Levan Amashukeli", "wine": "Tsinandali"},
  {"src": "/newui/gallery/g19.jpg", "artist": "Levan Amashukeli", "wine": "Tsinandali"},
  {"src": "/newui/gallery/g20.jpg", "artist": "Levan Amashukeli", "wine": "Tierra Roja"},
  {"src": "/newui/gallery/g21.jpg", "artist": "Rati Bakradze", "wine": "Mzeo"},
  {"src": "/newui/gallery/g22.jpg", "artist": "David Kakabadze", "wine": "Mzeo"},
];
