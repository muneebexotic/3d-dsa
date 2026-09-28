// Sets the colour theme before the page first paints, so a page never flashes
// the wrong colours: the viewer's saved choice, or else the system's. A classic
// script, because modules only run after the first paint; src/core/theme.ts
// takes over once the page's own code runs.
let theme = null;
try {
  theme = localStorage.getItem('theme');
} catch {
  // storage blocked: follow the system
}
if (theme !== 'light' && theme !== 'dark')
  theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
