'use client';

import { useState } from 'react';

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageIndex: number;
  onPrev: () => void;
  onNext: () => void;
  totalImages: number;
  caption: string;
}

export function LightboxOverlay({
  isOpen,
  onClose,
  imageIndex,
  onPrev,
  onNext,
  totalImages,
  caption,
}: LightboxProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center px-20 py-[60px]">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-8 w-10 h-10 rounded-full border-none bg-white/12 text-white text-xl leading-none cursor-pointer flex items-center justify-center hover:bg-white/22 transition"
        aria-label="Close lightbox"
      >
        ×
      </button>

      {/* Previous Button */}
      <button
        onClick={onPrev}
        className="absolute top-1/2 left-6 -translate-y-1/2 w-12 h-12 rounded-full border-none bg-white/12 text-white text-2xl cursor-pointer flex items-center justify-center hover:bg-white/22 transition"
        aria-label="Previous image"
      >
        &#8249;
      </button>

      {/* Content */}
      <div className="flex flex-col items-center gap-4 max-w-[600px] w-full">
        {/* Image Placeholder */}
        <div className="w-full aspect-[4/5] max-h-[70vh] bg-gradient-to-br from-[#E8E8E6] to-[#D2D2CE] rounded flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-14 h-14 text-[#AFAFAB] opacity-70">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>

        {/* Caption */}
        <div className="text-white text-[13px] tracking-[0.04em] text-center">{caption}</div>

        {/* Counter */}
        <div className="text-white/55 text-[11px] tracking-[0.05em]">
          {imageIndex + 1} of {totalImages}
        </div>
      </div>

      {/* Next Button */}
      <button
        onClick={onNext}
        className="absolute top-1/2 right-6 -translate-y-1/2 w-12 h-12 rounded-full border-none bg-white/12 text-white text-2xl cursor-pointer flex items-center justify-center hover:bg-white/22 transition"
        aria-label="Next image"
      >
        &#8250;
      </button>
    </div>
  );
}
