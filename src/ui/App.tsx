import { MatchScreen } from './MatchScreen';
import { RotateNotice } from './RotateNotice';
import { SetupScreen } from './SetupScreen';
import { useMatch } from './store';

export function App() {
  const screen = useMatch((s) => s.screen);
  return (
    <>
      {screen === 'setup' ? <SetupScreen /> : <MatchScreen />}
      <RotateNotice />
    </>
  );
}
