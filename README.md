# 3D Data Structures

An exhibition of algorithms in motion. Each chapter turns one data structure into a 3D piece you can orbit, step through and rewind. Every step comes with a plain-English caption.

**Live:** https://dsa.muscodes.com

| No. | Chapter                                                                                                                     | Status        |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | [AVL Mobile](https://dsa.muscodes.com/avl/): a self-balancing tree hung as a mobile, with LL, RR, LR and RL rotations       | live          |
| 2   | [Graph Net](https://dsa.muscodes.com/graphs/): BFS, DFS and Dijkstra on a net of strings, with race mode and a graph editor | live          |
| 3   | Lists, stacks & queues                                                                                                      | in the studio |
| 4   | Hash table                                                                                                                  | in the studio |
| 5   | Heap                                                                                                                        | in the studio |
| 6   | Sorting                                                                                                                     | in the studio |
| 7   | Trie                                                                                                                        | in the studio |

## Getting started

You need Node 22.12 or later (`nvm use` reads `.nvmrc`).

```
npm install
npm run dev
```

Then open http://localhost:5173/.

## Scripts

| Command             | What it does                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | Development server with hot reload.                                                                                                                           |
| `npm run build`     | Type-check, then build the site into `dist/`.                                                                                                                 |
| `npm run preview`   | Serve `dist/` with the production security headers.                                                                                                           |
| `npm run lint`      | ESLint.                                                                                                                                                       |
| `npm run typecheck` | TypeScript, no output.                                                                                                                                        |
| `npm run format`    | Format everything with Prettier (`format:check` only checks).                                                                                                 |
| `npm test`          | Unit tests (Vitest). `npm run test:watch` re-runs on save.                                                                                                    |
| `npm run test:e2e`  | End-to-end tests (Playwright): builds with test hooks, serves it, and drives Chromium on desktop and phone. Run `npx playwright install chromium` once first. |
| `npm run check`     | Types, lint, formatting and unit tests: what CI runs before the build.                                                                                        |

## Project layout

```
index.html, 404.html        landing page and not-found page (markup only)
avl/index.html              No. 1, AVL Mobile (markup only)
graphs/index.html           No. 2, Graph Net (markup only)
public/                     files served as-is (favicon)
src/
  core/                     shared by every chapter: step player, Three.js stage,
                            transport and narration, wire glyphs, sound
  site/chapters.ts          the chapter catalogue: nav, build pages and sitemap read it
  site/nav.ts               the navigation every chapter shares
  styles/tokens.css         design tokens and the shared gallery UI
  home/                     the landing page's code, drawings and styles
  chapters/avl/             AVL Mobile: engine, layout, poses, scene, panels, main
  chapters/graphs/          Graph Net: algorithms, presets, poses, motion, scene, editor, main
tests/
  unit/                     Vitest, mirrors src/
  e2e/                      Playwright
docs/
  ARCHITECTURE.md           how the pieces fit, and how to add a chapter
  DEPLOYMENT.md             Vercel and Cloudflare setup
```

Each algorithm runs instantly and records its steps. A chapter turns each step into a motion `pose(t)`, and the shared player plays those motions forward, or backward to rewind. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the layers and walks through adding a chapter.

## Deployment

Pushes to `main` deploy to Vercel; pull requests get preview deployments. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
