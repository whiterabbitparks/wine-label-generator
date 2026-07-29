'use client';

import { useLabelEditor } from '@/lib/store/labelEditorStore';

export function TabBar() {
  const { state, dispatch } = useLabelEditor();

  const tabs: Array<{ id: 'front' | 'back' | 'bottle' | 'gallery' | 'about'; label: string }> = [
    { id: 'front', label: 'Front Label' },
    { id: 'back', label: 'Back Label' },
    { id: 'bottle', label: 'Bottle & Marketing Images' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'about', label: 'About' },
  ];

  return (
    <nav className="sticky top-[82px] z-20 flex bg-cream-dark">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => dispatch({ type: 'SET_TAB', payload: tab.id })}
          className={`flex-1 px-3 py-4 text-center text-[12px] font-bold tracking-[0.1em] uppercase border-b-[1px] border-r border-line transition ${
            state.tab === tab.id
              ? 'bg-white text-olive-dark border-b-white'
              : 'bg-[#E2E2E2] text-[#8C8C8C] hover:bg-[#ECECEC]'
          } ${tabs.indexOf(tab) === tabs.length - 1 ? 'border-r-0' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
