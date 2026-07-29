'use client';

import { useLabelEditor } from '@/lib/store/labelEditorStore';

export function BottlePanel() {
  const { state, dispatch } = useLabelEditor();

  const bottleOptions = [
    { id: 'bordeaux', name: 'Bordeaux' },
    { id: 'burgundy', name: 'Burgundy' },
    { id: 'alsace', name: 'Alsace' },
    { id: 'champagne', name: 'Champagne' },
  ];

  return (
    <main className="max-w-[1180px] mx-auto px-10 pb-[100px] pt-11">
      <div className="mb-[18px]">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Bottle &amp; Marketing Images
        </h2>
      </div>

      <p className="text-[13px] text-ink-soft mb-6">Choose a bottle style and we'll create marketing assets for your wine:</p>

      <div className="grid grid-cols-2 gap-10 items-start">
        <div className="bg-white flex flex-col items-center justify-center p-[30px] gap-[18px]">
          <div className="w-auto max-w-full h-auto max-h-[420px]">
            <div className="w-40 h-64 bg-gradient-to-b from-green-800 to-green-900 rounded flex items-center justify-center text-white text-sm">
              Bottle Preview
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-center max-w-[260px]">
            {bottleOptions.map((option) => (
              <div
                key={option.id}
                className="inline-flex items-center gap-1.5 border border-line bg-cream rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft"
              >
                <div className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: state.wineColor }}></div>
                {option.name}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-olive-dark mb-4">Bottle Shape</h3>
            <div className="space-y-2.5">
              {bottleOptions.map((option) => (
                <label key={option.id} className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                  <input type="radio" name="bottle" value={option.id} className="w-[15px] h-[15px] appearance-none accent-olive" />
                  {option.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-olive-dark mb-4">Marketing Assets</h3>
            <p className="text-[12px] text-ink-soft mb-3">Include bottle on these marketing materials:</p>
            <div className="space-y-2.5">
              {['Email template', 'Social media', 'Website banner', 'Print ad'].map((asset) => (
                <label key={asset} className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" />
                  {asset}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
