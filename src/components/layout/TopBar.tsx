'use client';

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-10 py-[18px] bg-white border-b border-line">
      <div className="flex items-center gap-2.5 cursor-pointer">
        <div className="w-[46px] h-[46px] border-2 border-ink flex items-center justify-center font-bold text-xl tracking-[-1px]">
          8K
        </div>
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase">8K Labels</div>
      </div>
      <nav className="flex gap-8">
        <a href="#" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink hover:text-olive-dark transition">
          About Us
        </a>
        <a href="#" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink hover:text-olive-dark transition">
          Gallery
        </a>
        <a href="#" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink hover:text-olive-dark transition">
          Contact
        </a>
      </nav>
    </header>
  );
}
