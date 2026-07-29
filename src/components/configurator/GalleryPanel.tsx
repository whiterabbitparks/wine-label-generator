'use client';

import { useState } from 'react';
import { GALLERY_FILTERS, getFilteredGallery } from '@/lib/gallery-data';
import { LightboxOverlay } from '../gallery/LightboxOverlay';

export function GalleryPanel() {
  const [activeFilter, setActiveFilter] = useState('All Styles');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const filteredItems = getFilteredGallery(activeFilter);

  const handlePrev = () => {
    setLightboxIndex((prev) => (prev === 0 ? filteredItems.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setLightboxIndex((prev) => (prev === filteredItems.length - 1 ? 0 : prev + 1));
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <main className="max-w-[1180px] mx-auto px-10 pb-[100px] pt-11">
      <div className="mb-[18px]">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Gallery
        </h2>
      </div>

      <p className="text-[13px] text-ink-soft mb-8">
        Browse label designs by style, or take a look at our marketing work and client stories.
      </p>

      {/* Gallery Filters */}
      <div className="flex gap-0 mb-8 border border-line">
        {GALLERY_FILTERS.map((filter, idx) => (
          <button
            key={filter}
            onClick={() => {
              setActiveFilter(filter);
              setLightboxIndex(0);
            }}
            className={`flex-1 px-2 py-3 border-r border-line text-center text-[11px] font-bold tracking-[0.03em] uppercase transition ${
              activeFilter === filter
                ? 'bg-olive text-white border-olive'
                : 'bg-white text-ink-soft hover:bg-cream-dark hover:text-olive-dark'
            } ${idx === GALLERY_FILTERS.length - 1 ? 'border-r-0' : ''}`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {filteredItems.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => openLightbox(idx)}
            className="flex flex-col gap-2 cursor-pointer"
          >
            <div className="aspect-square bg-gradient-to-br from-[#E8E8E6] to-[#D2D2CE] rounded border border-line flex items-center justify-center hover:opacity-90 transition">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-8 h-8 text-[#AFAFAB] opacity-70"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <p className="text-[11px] text-ink-soft text-center tracking-[0.03em]">{item.title}</p>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <LightboxOverlay
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        imageIndex={lightboxIndex}
        onPrev={handlePrev}
        onNext={handleNext}
        totalImages={filteredItems.length}
        caption={filteredItems[lightboxIndex]?.title || ''}
      />
    </main>
  );
}
