'use client';

export function Hero() {
  return (
    <section className="relative text-cream min-h-[420px] flex items-end overflow-hidden bg-gradient-to-b from-gray-800 via-gray-900 to-black">
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/55 to-black/15 z-0"></div>

      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <button
          className="pointer-events-auto w-[60px] h-[60px] rounded-full bg-white/92 border-none flex items-center justify-center text-ink cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:bg-white hover:scale-105 transition"
          aria-label="Play video"
        >
          <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] ml-1" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        <div className="absolute left-6 right-6 bottom-[18px] flex items-center gap-2.5 pointer-events-auto">
          <div className="flex-1 h-[3px] bg-white/35 rounded overflow-hidden">
            <div className="w-[16%] h-full bg-white"></div>
          </div>
          <span className="text-[11px] text-white tracking-[0.02em] tabular-nums">0:00 / 0:12</span>
        </div>
      </div>

      <div className="relative z-20 w-full max-w-[1180px] mx-auto px-10 pb-11 pt-16">
        <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-olive-light">Step 1</div>
        <h1 className="text-cream font-[500] text-[clamp(30px,4vw,46px)] leading-[1.08] max-w-[14ch] mt-0">
          Your Front Label, Your Story.
        </h1>
        <p className="text-[#D6D6D6] max-w-[46ch] mt-4 text-[15px]">
          Tell us your vision and label details — we'll generate six print-ready front label styles to choose from.
        </p>
      </div>
    </section>
  );
}
