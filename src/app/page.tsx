'use client';

import { useState } from 'react';
import { LabelEditorProvider, useLabelEditor } from '@/lib/store/labelEditorStore';
import { TopBar } from '@/components/layout/TopBar';
import { Hero } from '@/components/layout/Hero';
import { TabBar } from '@/components/layout/TabBar';
import { FrontPanel } from '@/components/configurator/FrontPanel';
import { BackPanel } from '@/components/configurator/BackPanel';
import { BottlePanel } from '@/components/configurator/BottlePanel';
import { GalleryPanel } from '@/components/configurator/GalleryPanel';
import { AboutPanel } from '@/components/configurator/AboutPanel';
import { Footer } from '@/components/layout/Footer';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { ToastNotification, type Toast } from '@/components/toast/ToastNotification';

function ConfiguratorContent() {
  const { state } = useLabelEditor();

  return (
    <>
      <TopBar />
      <Hero />
      <TabBar />
      {state.tab === 'front' && <FrontPanel />}
      {state.tab === 'back' && <BackPanel />}
      {state.tab === 'bottle' && <BottlePanel />}
      {state.tab === 'gallery' && <GalleryPanel />}
      {state.tab === 'about' && <AboutPanel />}
      <Footer />
    </>
  );
}

export default function Home() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <LabelEditorProvider>
      <ConfiguratorContent />
      <ChatWidget />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </LabelEditorProvider>
  );
}
