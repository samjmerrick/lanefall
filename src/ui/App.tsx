import { useEffect } from 'react';
import { useApp } from './app';
import { MatchScreen } from './MatchScreen';
import { CardDetail } from './Overlays';
import { RotateNotice } from './RotateNotice';
import { CollectionScreen } from './screens/CollectionScreen';
import { CorruptScreen } from './screens/CorruptScreen';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { DecksScreen } from './screens/DecksScreen';
import { MenuScreen } from './screens/MenuScreen';
import { QuickPlayScreen } from './screens/QuickPlayScreen';
import { RunScreen } from './screens/RunScreen';
import { RunStartScreen } from './screens/RunStartScreen';
import { RunSummaryScreen } from './screens/RunSummaryScreen';
import { SettingsScreen } from './screens/SettingsScreen';

function CurrentScreen() {
  const screen = useApp((s) => s.screen);
  switch (screen) {
    case 'loading':
      return <main className="loading" aria-label="Loading" aria-busy="true" />;
    case 'corrupt':
      return <CorruptScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'quickplay':
      return <QuickPlayScreen />;
    case 'decks':
      return <DecksScreen />;
    case 'builder':
      return <DeckBuilderScreen />;
    case 'collection':
      return <CollectionScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'match':
      return <MatchScreen />;
    case 'runStart':
      return <RunStartScreen />;
    case 'run':
      return <RunScreen />;
    case 'runSummary':
      return <RunSummaryScreen />;
  }
}

export function App() {
  const boot = useApp((s) => s.boot);
  useEffect(() => {
    void boot();
  }, [boot]);
  return (
    <>
      <CurrentScreen />
      <CardDetail />
      <RotateNotice />
    </>
  );
}
