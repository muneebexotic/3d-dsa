/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public address of the site, e.g. https://dsa.muscodes.com */
  readonly VITE_SITE_URL: string;
  /** "true" only in end-to-end test builds; exposes window.__avl and window.__graph. */
  readonly VITE_TEST_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
