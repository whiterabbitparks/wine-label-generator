'use client';

import { LabelEditorProvider, useLabelEditor } from '@/lib/store/labelEditorStore';
import { TopBar } from '@/components/layout/TopBar';
import { Hero } from '@/components/layout/Hero';
import { TabBar } from '@/components/layout/TabBar';
import { FrontPanel } from '@/components/configurator/FrontPanel';
import { BackPanel } from '@/components/configurator/BackPanel';
import { BottlePanel } from '@/components/configurator/BottlePanel';
import { Footer } from '@/components/layout/Footer';

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
      <Footer />
    </>
  );
}

export default function Home() {
  return (
    <LabelEditorProvider>
      <ConfiguratorContent />
    </LabelEditorProvider>
  );
}
