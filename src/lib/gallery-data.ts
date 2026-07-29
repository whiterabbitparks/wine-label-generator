export interface GalleryItem {
  id: string;
  title: string;
  style: string;
  category: string;
}

export const GALLERY_ITEMS: GalleryItem[] = [
  { id: '1', title: 'Château Elegance', style: 'Traditional', category: 'Premium' },
  { id: '2', title: 'Modern Vineyard', style: 'Contemporary', category: 'Modern' },
  { id: '3', title: 'Flora Essence', style: 'Flora', category: 'Artistic' },
  { id: '4', title: 'Premium Gold', style: 'Premium', category: 'Premium' },
  { id: '5', title: 'Minimal Beauty', style: 'Minimalist', category: 'Modern' },
  { id: '6', title: 'Artistic Blend', style: 'Artistic', category: 'Artistic' },
  { id: '7', title: 'Traditional Charm', style: 'Traditional', category: 'Premium' },
  { id: '8', title: 'Contemporary Wave', style: 'Contemporary', category: 'Modern' },
  { id: '9', title: 'Flora Dreams', style: 'Flora', category: 'Artistic' },
  { id: '10', title: 'Premium Exclusive', style: 'Premium', category: 'Premium' },
  { id: '11', title: 'Minimalist Zen', style: 'Minimalist', category: 'Modern' },
  { id: '12', title: 'Artistic Expression', style: 'Artistic', category: 'Artistic' },
];

export const GALLERY_FILTERS = ['All Styles', 'Traditional', 'Contemporary', 'Flora', 'Premium', 'Minimalist', 'Artistic'];

export function getFilteredGallery(filter: string): GalleryItem[] {
  if (filter === 'All Styles') return GALLERY_ITEMS;
  return GALLERY_ITEMS.filter((item) => item.style === filter);
}
