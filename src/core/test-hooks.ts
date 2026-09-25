/**
 * Exposes `api` as `window[name]` for the end-to-end tests. Only builds made with
 * VITE_TEST_HOOKS=true (`npm run build:e2e`) include it; production builds never do.
 */
export function exposeTestHooks(name: string, api: object): void {
  if (import.meta.env.VITE_TEST_HOOKS === 'true') Object.assign(window, { [name]: api });
}
