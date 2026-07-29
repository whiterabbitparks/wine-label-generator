'use client';

export function PreviewLoader() {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="loader-label text-[12px] tracking-[0.08em] uppercase text-ink-soft font-bold">
        Rendering Labels...
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-olive animate-pulse"></div>
        <div className="w-2 h-2 rounded-full bg-olive animate-pulse" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-2 h-2 rounded-full bg-olive animate-pulse" style={{ animationDelay: '0.4s' }}></div>
      </div>
    </div>
  );
}
