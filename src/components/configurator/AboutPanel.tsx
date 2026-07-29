'use client';

import { TEAM_MEMBERS } from '@/lib/team-data';

export function AboutPanel() {
  return (
    <main className="max-w-[1180px] mx-auto px-10 pb-[100px] pt-11">
      <div className="mb-[18px]">
        <h2 className="inline-block text-[26px] font-bold tracking-[0.06em] uppercase text-olive-dark mb-0 relative pb-2 border-b-[1.5px] border-dashed border-olive-light">
          About Us
          <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-ink-soft text-[10px] font-bold text-ink-soft bg-white cursor-default">
            ?
          </span>
        </h2>
      </div>

      <p className="text-[13px] text-ink-soft mb-12">
        The people behind 8K Labels.
      </p>

      {/* Team Grid */}
      <div className="grid grid-cols-4 gap-8">
        {TEAM_MEMBERS.map((member) => (
          <div key={member.id} className="flex flex-col items-center text-center gap-2">
            <div className="w-[120px] h-[120px] rounded-full bg-gradient-to-br from-[#E8E8E6] to-[#D2D2CE] flex items-center justify-center border border-line flex-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-11 h-11 text-[#AFAFAB] opacity-70">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <p className="text-[14px] font-bold text-ink mt-1.5">{member.name}</p>
            <p className="text-[10.5px] text-olive-dark font-bold tracking-[0.05em] uppercase">{member.role}</p>
            <p className="text-[12.5px] text-ink-soft leading-[1.55]">{member.bio}</p>
            <a href="#" className="text-[11px] font-bold text-olive-dark underline tracking-[0.03em] uppercase mt-1">
              View Profile
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
