'use client';

import { useRef, useEffect, useState } from 'react';
import { useLabelEditor } from '@/lib/store/labelEditorStore';
import { renderStyleOptions } from '@/lib/label-engine';
import { PreviewLoader } from './PreviewLoader';

export function FrontPanel() {
  const { state, dispatch } = useLabelEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [diagramSize, setDiagramSize] = useState({ width: 360, height: 264 });

  useEffect(() => {
    const baseSize = 180;
    if (state.orientation === 'h') {
      setDiagramSize({
        width: baseSize * (state.widthMM / state.heightMM),
        height: baseSize,
      });
    } else {
      setDiagramSize({
        width: baseSize,
        height: baseSize * (state.heightMM / state.widthMM),
      });
    }
  }, [state.orientation, state.widthMM, state.heightMM]);

  const handleGenerateLabels = async () => {
    setLoading(true);
    try {
      const wineData = {
        producer: state.producer,
        wine: state.wine,
        appellation: state.appellation,
        classification: state.classification,
        grape: state.grape,
        region: state.region,
        country: state.country,
        special: state.special,
        vintage: state.vintage,
        alcohol: state.alcohol,
        volume: state.volume,
        sweetness: state.sweetness,
        wineColorName: state.wineColorName,
        wineType: state.wineType,
        wineColor: state.wineColor,
      };

      const results = await renderStyleOptions(wineData, [], {
        widthMM: state.widthMM,
        heightMM: state.heightMM,
        seed: 42,
      });
      setLabels(results);
    } catch (error) {
      console.error('Error generating labels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSketchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      dispatch({ type: 'SET_SKETCH_FILE', payload: file });
    }
  };

  const wordCount = state.visionText.split(/\s+/).filter(Boolean).length;
  const wordLimit = 300;

  return (
    <main className="max-w-[1180px] mx-auto px-10 pb-[100px] pt-11">
      <div className="mb-[18px] mt-0">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Your Vision
          <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-ink-soft text-[10px] font-bold text-ink-soft bg-white cursor-default">
            ?
          </span>
        </h2>
      </div>

      <textarea
        value={state.visionText}
        onChange={(e) => dispatch({ type: 'SET_VISION', payload: e.target.value })}
        maxLength={2200}
        placeholder="If you already have a vision for your label, feel free to describe it in simple words..."
        className="w-full px-3 py-2.5 border border-line bg-white text-ink font-[Hepta_Slab] text-[13px] rounded-[2px] resize-vertical min-h-[110px] focus:outline-2 focus:outline-offset-1 focus:outline-olive-light focus:border-olive placeholder:text-[#ADADAD]"
      />

      <div className={`text-right text-[11px] mt-1.5 ${wordCount > wordLimit ? 'text-wine font-bold' : 'text-ink-soft'}`}>
        {wordCount} / {wordLimit} words
      </div>

      <div className="flex gap-3 flex-wrap mt-[14px]">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 border border-ink bg-white text-ink px-4 py-2.5 text-[12px] font-semibold tracking-[0.03em] cursor-pointer underline hover:bg-cream-dark transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[13px] h-[13px]">
            <path d="M12 3v12M7 8l5-5 5 5M5 21h14" />
          </svg>
          Upload a sketch or a reference photo
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleSketchFileChange} hidden />
        {state.sketchFile && <div className="text-[11px] text-ink-soft">{state.sketchFile.name}</div>}
      </div>

      <div className="mb-[18px] mt-11">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Label Orientation &amp; Size
          <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-ink-soft text-[10px] font-bold text-ink-soft bg-white cursor-default">
            ?
          </span>
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-[22px] items-start">
        <div className="justify-self-start">
          <div className="flex gap-[22px]">
            <label className="flex items-center gap-2.5 font-[13px] cursor-pointer">
              <input
                type="radio"
                name="orientation"
                value="h"
                checked={state.orientation === 'h'}
                onChange={(e) => dispatch({ type: 'SET_ORIENTATION', payload: 'h' })}
                className="w-[15px] h-[15px] rounded-full border-[1.5px] border-[#B0B0B0] appearance-none cursor-pointer accent-olive"
              />
              Horizontal
            </label>
            <label className="flex items-center gap-2.5 font-[13px] cursor-pointer">
              <input
                type="radio"
                name="orientation"
                value="v"
                checked={state.orientation === 'v'}
                onChange={(e) => dispatch({ type: 'SET_ORIENTATION', payload: 'v' })}
                className="w-[15px] h-[15px] rounded-full border-[1.5px] border-[#B0B0B0] appearance-none cursor-pointer accent-olive"
              />
              Vertical
            </label>
          </div>

          <div className="flex gap-2.5 items-center mt-[18px]">
            <input
              type="number"
              value={state.widthMM}
              onChange={(e) =>
                dispatch({ type: 'SET_DIMENSIONS', payload: { width: parseInt(e.target.value) || 0, height: state.heightMM } })
              }
              className="w-[70px] text-center px-3 py-2 border border-line bg-white text-ink rounded font-[Hepta_Slab] text-[13px]"
            />
            <span className="text-ink-soft">mm</span>
            <span className="text-ink-soft">×</span>
            <input
              type="number"
              value={state.heightMM}
              onChange={(e) =>
                dispatch({ type: 'SET_DIMENSIONS', payload: { width: state.widthMM, height: parseInt(e.target.value) || 0 } })
              }
              className="w-[70px] text-center px-3 py-2 border border-line bg-white text-ink rounded font-[Hepta_Slab] text-[13px]"
            />
            <span className="text-ink-soft">mm</span>
          </div>
        </div>

        <div className="justify-self-center">
          <div className="grid grid-cols-2 gap-2 auto-rows-auto items-center">
            <div className="col-start-2 col-end-3 text-center text-[11px] text-olive-dark font-bold">
              {state.widthMM}mm
            </div>
            <div className="col-start-1 row-start-2 text-[11px] text-olive-dark font-bold" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              {state.heightMM}mm
            </div>
            <div
              className="col-start-2 row-start-2 border-[1.5px] border-ink bg-white relative"
              style={{ width: diagramSize.width, height: diagramSize.height }}
            >
              <svg viewBox="0 0 180 132" preserveAspectRatio="none" className="w-full h-full">
                <line x1="0" y1="0" x2="180" y2="132" stroke="#1E1E1E" strokeWidth="1" />
              </svg>
            </div>
          </div>
        </div>

        <div></div>
      </div>

      <hr className="border-none my-8" />

      <div className="mb-[18px]">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          Front Label Information
          <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-ink-soft text-[10px] font-bold text-ink-soft bg-white cursor-default">
            ?
          </span>
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-2">
        <div>
          <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2.5">Wine Type</h4>
          {['Still Wine', 'Sparkling Wine', 'Pét-Nat', 'Fortified Wine', 'Ice Wine'].map((type) => (
            <label key={type} className="flex items-center gap-2.5 mb-2.5 text-[13px] cursor-pointer">
              <input
                type="radio"
                name="wineType"
                value={type}
                checked={state.wineType === type}
                onChange={(e) => dispatch({ type: 'SET_WINE_TYPE', payload: e.target.value })}
                className="w-[15px] h-[15px] rounded-full appearance-none accent-olive"
              />
              {type}
            </label>
          ))}
        </div>

        <div>
          <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2.5">Wine Color</h4>
          {[
            { name: 'Red', color: '#6E1423' },
            { name: 'White', color: '#F3ECC9' },
            { name: 'Orange', color: '#E58A2A' },
          ].map((option) => (
            <label key={option.name} className="flex items-center gap-2.5 mb-2.5 text-[13px] cursor-pointer">
              <input
                type="radio"
                name="wineColor"
                value={option.name}
                checked={state.wineColorName === option.name}
                onChange={(e) =>
                  dispatch({ type: 'SET_WINE_COLOR', payload: { color: option.color, name: option.name } })
                }
                className="w-[15px] h-[15px] rounded-full appearance-none accent-olive"
              />
              {option.name}
            </label>
          ))}
        </div>

        <div>
          <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-ink mb-2.5">Sweetness</h4>
          {['Dry', 'Off-Dry', 'Semi-Sweet', 'Sweet'].map((type) => (
            <label key={type} className="flex items-center gap-2.5 mb-2.5 text-[13px] cursor-pointer">
              <input
                type="radio"
                name="sweetness"
                value={type}
                checked={state.sweetness === type}
                onChange={(e) => dispatch({ type: 'SET_SWEETNESS', payload: e.target.value })}
                className="w-[15px] h-[15px] rounded-full appearance-none accent-olive"
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <FieldInput label="Producer" value={state.producer} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'producer', value: v } })} />
        <FieldInput label="Wine Name" value={state.wine} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'wine', value: v } })} />
        <FieldInput label="Appellation" value={state.appellation} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'appellation', value: v } })} />
        <FieldInput label="Classification" value={state.classification} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'classification', value: v } })} />
        <FieldInput label="Grape" value={state.grape} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'grape', value: v } })} />
        <FieldInput label="Region" value={state.region} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'region', value: v } })} />
        <FieldInput label="Country" value={state.country} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'country', value: v } })} />
        <FieldInput label="Vintage" value={state.vintage} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'vintage', value: v } })} />
        <FieldInput label="Alcohol %" value={state.alcohol} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'alcohol', value: v } })} />
        <FieldInput label="Volume" value={state.volume} onChange={(v) => dispatch({ type: 'SET_FIELD', payload: { field: 'volume', value: v } })} />
      </div>

      <button
        onClick={handleGenerateLabels}
        disabled={loading}
        className="w-full mt-[26px] mb-[26px] bg-olive text-white border-none px-[26px] py-4 text-[12px] font-bold tracking-[0.08em] uppercase cursor-pointer rounded-[2px] hover:bg-olive-dark transition disabled:opacity-50"
      >
        {loading ? 'Rendering Labels...' : 'Generate Labels'}
      </button>

      {loading ? (
        <PreviewLoader />
      ) : labels.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {labels.map((label) => (
              <div key={label.rank} className="border border-line bg-white rounded overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-olive to-olive-dark">
                  <h3 className="text-white font-bold text-lg">{label.name}</h3>
                  <p className="text-olive-light text-sm">{label.desc}</p>
                </div>
                <div className="p-4 flex justify-center bg-gray-50 min-h-64 items-center">
                  <div dangerouslySetInnerHTML={{ __html: label.svg }} className="w-full" />
                </div>
                <div className="p-4">
                  <a
                    href={`data:image/svg+xml;base64,${btoa(label.svg)}`}
                    download={`label-${label.rank}-${state.wine.toLowerCase().replace(/\s+/g, '-')}.svg`}
                    className="inline-block px-4 py-2 bg-olive text-white rounded font-bold text-sm hover:bg-olive-dark transition"
                  >
                    Download SVG
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-soft mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-line bg-white text-ink rounded-[2px] font-[Hepta_Slab] text-[13px] h-[38px] box-border focus:outline-2 focus:outline-offset-1 focus:outline-olive-light focus:border-olive"
      />
    </div>
  );
}
