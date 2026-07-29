'use client';

export function Footer() {
  return (
    <footer className="bg-ink text-[#B5B5B5] px-10 py-[26px] flex justify-between flex-wrap gap-3 text-[11px] tracking-[0.08em] uppercase">
      <div>© 8K Labels. All rights reserved.</div>
      <div className="flex gap-5">
        <a href="#" className="text-[#D6D6D6] no-underline hover:text-white transition">
          Privacy
        </a>
        <a href="#" className="text-[#D6D6D6] no-underline hover:text-white transition">
          Terms
        </a>
        <a href="#" className="text-[#D6D6D6] no-underline hover:text-white transition">
          Support
        </a>
      </div>
    </footer>
  );
}
