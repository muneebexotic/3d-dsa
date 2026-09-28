// Vercel Web Analytics, for every page that imports this module. Vercel serves
// the script (/_vercel/insights/script.js) only on a deployment, so only a
// production build asks for it: under `vite preview` and in the end-to-end build
// the request would 404 and log an error on every page.

import { inject } from '@vercel/analytics';

if (import.meta.env.MODE === 'production') inject();
