// Builds the viewer's page from `viewer/` into `dist/viewer/page/`: one script, one stylesheet and the HTML
// file. React and the WordPress design system are bundled in, so a project that installs the package needs
// none of them.

import { build } from 'esbuild';

await build({
  entryPoints: ['viewer/main.tsx', 'viewer/index.html'],
  outdir: 'dist/viewer/page',
  bundle: true,
  minify: true,
  jsx: 'automatic',
  loader: { '.html': 'copy' },
  // The WordPress packages ask for this to leave their development-only checks out.
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
