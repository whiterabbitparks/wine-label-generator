'use client';

export function BackPanel() {
  return (
    <main className="max-w-[1180px] mx-auto px-10 pb-[100px] pt-11">
      <div className="mb-[18px]">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Back Label Details
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-8 mt-6">
        <div>
          <label className="block text-[12px] font-semibold text-ink-soft mb-1.5">Description</label>
          <textarea
            placeholder="Describe your wine, tasting notes, food pairings..."
            className="w-full px-3 py-2.5 border border-line bg-white text-ink rounded-[2px] font-[Hepta_Slab] text-[13px] resize-vertical min-h-[160px] focus:outline-2 focus:outline-offset-1 focus:outline-olive-light focus:border-olive"
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-ink-soft mb-1.5">Importer</label>
            <input
              type="text"
              placeholder="Importer name"
              className="w-full px-3 py-2.5 border border-line bg-white text-ink rounded-[2px] font-[Hepta_Slab] text-[13px] h-[38px] box-border focus:outline-2 focus:outline-offset-1 focus:outline-olive-light focus:border-olive"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-ink-soft mb-1.5">Bottling Date</label>
            <input
              type="text"
              placeholder="e.g., April 2023"
              className="w-full px-3 py-2.5 border border-line bg-white text-ink rounded-[2px] font-[Hepta_Slab] text-[13px] h-[38px] box-border focus:outline-2 focus:outline-offset-1 focus:outline-olive-light focus:border-olive"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-ink-soft mb-1.5">Lot Number</label>
            <input
              type="text"
              placeholder="e.g., Lot 042"
              className="w-full px-3 py-2.5 border border-line bg-white text-ink rounded-[2px] font-[Hepta_Slab] text-[13px] h-[38px] box-border focus:outline-2 focus:outline-offset-1 focus:outline-olive-light focus:border-olive"
            />
          </div>
        </div>
      </div>

      <hr className="border-none my-8" />

      <div className="mb-[18px]">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Export Compliance
        </h2>
      </div>

      <p className="text-[13px] text-ink-soft mb-4">Select countries where this wine will be legally exported:</p>

      <div className="grid grid-cols-4 gap-4">
        {['🇺🇸 USA', '🇬🇧 UK', '🇨🇦 Canada', '🇦🇺 Australia', '🇯🇵 Japan', '🇸🇬 Singapore'].map((country) => (
          <label key={country} className="flex items-center gap-2.5 text-[13px] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 cursor-pointer" />
            {country}
          </label>
        ))}
      </div>
    </main>
  );
}
