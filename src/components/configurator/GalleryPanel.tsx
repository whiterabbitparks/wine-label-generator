'use client';

export function GalleryPanel() {
  const filters = [
    'All Styles',
    'Traditional',
    'Contemporary',
    'Flora',
    'Premium',
    'Minimalist',
    'Artistic',
  ];

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
        {filters.map((filter, idx) => (
          <button
            key={filter}
            className={`flex-1 px-2 py-3 border-r border-line text-center text-[11px] font-bold tracking-[0.03em] uppercase transition ${
              idx === 0
                ? 'bg-olive text-white border-olive'
                : 'bg-white text-ink-soft hover:bg-cream-dark hover:text-olive-dark'
            } ${idx === filters.length - 1 ? 'border-r-0' : ''}`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-auto-fill gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-square bg-gradient-to-br from-[#E8E8E6] to-[#D2D2CE] rounded border border-line flex items-center justify-center cursor-pointer hover:opacity-90 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-[#AFAFAB] opacity-70">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <p className="text-[11px] text-ink-soft text-center tracking-[0.03em]">
              Label Design {i + 1}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
