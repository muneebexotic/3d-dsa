import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { LIVE_CHAPTERS, chapterPath } from './src/site/chapters.ts';
import vercel from './vercel.json' with { type: 'json' };

const root = fileURLToPath(new URL('.', import.meta.url));

// One HTML entry per page: the landing page, the 404 page, and every live chapter.
const pages: Record<string, string> = {
  home: `${root}index.html`,
  notFound: `${root}404.html`,
  ...Object.fromEntries(LIVE_CHAPTERS.map(c => [c.slug, `${root}${c.slug}/index.html`])),
};

/** Writes sitemap.xml and robots.txt for the site's public address. */
function seoFiles(siteUrl: string): Plugin {
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      const base = siteUrl.replace(/\/$/, '');
      const urls = ['/', ...LIVE_CHAPTERS.map(c => chapterPath(c.slug))];
      const sitemap =
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join('\n') +
        '\n</urlset>\n';
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`,
      });
    },
  };
}

// `vite preview` sends the same headers Vercel will, so the end-to-end tests run under the real CSP.
const productionHeaders = Object.fromEntries(
  (vercel.headers.find(h => h.source === '/(.*)')?.headers ?? []).map(h => [h.key, h.value]),
);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  if (!env.VITE_SITE_URL) throw new Error('VITE_SITE_URL is not set; see .env');
  return {
    // Separate HTML pages, not a single-page app: an unknown path is a 404, never index.html.
    appType: 'mpa',
    build: {
      target: 'es2022',
      sourcemap: true,
      rolldownOptions: {
        input: pages,
        // Three.js changes far less often than our code, so it gets its own long-cached file.
        output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } },
      },
      // Three.js alone is ~600 kB minified (~150 kB gzipped); every other chunk is far below this.
      chunkSizeWarningLimit: 650,
    },
    plugins: [seoFiles(env.VITE_SITE_URL)],
    resolve: { alias: { '@': `${root}src` } },
    preview: { headers: productionHeaders },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
