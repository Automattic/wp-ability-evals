// Picks the screen the address names: Overview, Stories, Abilities, MCP Inspector, Runs, one run, or one trial.

import { useEffect, useState } from 'react';
import { AbilitiesPage } from './abilities-page.tsx';
import { screenOf } from './data.ts';
import { InspectorPage } from './inspector-page.tsx';
import { OverviewPage } from './overview-page.tsx';
import { RunPage } from './run-page.tsx';
import { RunsPage } from './runs-page.tsx';
import { StoriesPage } from './stories-page.tsx';
import { TrialPage } from './trial-page.tsx';

export function App() {
  const [screen, setScreen] = useState(() => screenOf(location.hash));
  useEffect(() => {
    const onChange = () => {
      setScreen(screenOf(location.hash));
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);

  if (screen.name === 'stories') return <StoriesPage pack={screen.pack} />;
  if (screen.name === 'abilities') return <AbilitiesPage pack={screen.pack} />;
  if (screen.name === 'inspector') return <InspectorPage />;
  if (screen.name === 'run') return <RunPage id={screen.id} />;
  if (screen.name === 'trial') return <TrialPage id={screen.id} file={screen.file} />;
  if (screen.name === 'runs') return <RunsPage />;
  return <OverviewPage />;
}
