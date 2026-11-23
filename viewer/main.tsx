// The viewer's page: what a browser loads from the `view` command. It shows the runs saved in a project's
// results folder, read from the viewer's server (`src/viewer/server.ts`), with the WordPress design system.

// The order matters: the design tokens first, then the components that DataViews is built on, then DataViews.
import '@wordpress/theme/design-tokens.css';
import '@wordpress/components/build-style/style.css';
import '@wordpress/dataviews/build-style/style.css';
import './style.css';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<App />);
