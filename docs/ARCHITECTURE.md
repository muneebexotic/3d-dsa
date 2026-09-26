# Architecture

3D Data Structures is a static, multi-page site built with Vite and strict TypeScript. Each chapter is its own HTML page with its own entry module; they share a small core. Nothing runs on a server.

## The one idea: record, then perform

Every chapter works the same way:

1. **Record.** The algorithm runs instantly on plain data and records a list of **steps**. Each step is a full snapshot (the whole tree or graph at that moment) plus the narration for it.
2. **Describe.** For each step, the chapter builds a **transition**: `{ dur, pose(t) }`, where `t` runs from 0 to 1. A **pose** is a plain object that says where everything is at one instant. Step `i` starts exactly where step `i - 1` came to rest.
3. **Perform.** The shared **player** (`src/core/player.ts`) plays transitions forward, plays the same function from 1 back to 0 to rewind, seeks with a blend, and holds between steps for reading time. The **scene** draws whatever pose it is handed, every frame.

Because the algorithm never runs "live" during the animation, rewinding and seeking cost nothing, and the algorithm, the motion and the drawing can each be tested on their own.

## Layers

```
src/
  core/        shared by every chapter; knows nothing about any one chapter
  site/        the chapter catalogue, navigation, 404 styles
  styles/      design tokens and the shared gallery UI (tokens.css)
  home/        the landing page
  chapters/
    <slug>/    one folder per chapter
```

Inside a chapter, modules fall into three layers. Imports only point down.

| Layer                                           | Graph Net                                                         | AVL Mobile                          | Pointer Chain                                                                                                                     | Hash Clock                                                            | Heap Pyramid                                                             | Sorting Loom                                                | May use DOM / Three.js?         | Unit-tested              |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------- | ------------------------ |
| **Model:** the algorithm and its recorded steps | `algorithms.ts`, `presets.ts`                                     | `engine.ts`                         | `diagram.ts`, `memory.ts`, `linked.ts`, `listops.ts`, `array.ts`, `stack.ts`, `queue.ts`, `bridge.ts`, `code.ts`, `complexity.ts` | `hash.ts`, `table.ts`, `diagram.ts`, `record.ts`, `ops.ts`, `code.ts` | `heap.ts`, `diagram.ts`, `record.ts`, `ops.ts`, `dijkstra.ts`, `code.ts` | `threads.ts`, `sorts.ts`, `diagram.ts`, `ops.ts`, `code.ts` | no                              | yes                      |
| **Motion:** poses and transitions               | `poses.ts`, `motion.ts`, `program.ts`                             | `layout.ts`, `poses.ts`             | `layout.ts`, `palette.ts`, `poses.ts`, `motion.ts`                                                                                | `layout.ts`, `palette.ts`, `poses.ts`, `motion.ts`                    | `layout.ts`, `palette.ts`, `poses.ts`, `motion.ts`                       | `layout.ts`, `palette.ts`, `poses.ts`, `motion.ts`          | no (Three.js colour maths only) | yes                      |
| **View:** drawing and UI                        | `scene.ts`, `panels.ts`, `inspector.ts`, `editing.ts`, `sound.ts` | `scene.ts`, `panels.ts`, `sound.ts` | `scene.ts`, `panels.ts`, `sound.ts`, `state.ts`                                                                                   | `scene.ts`, `panels.ts`, `sound.ts`, `state.ts`                       | `scene.ts`, `panels.ts`, `sound.ts`, `state.ts`                          | `scene.ts`, `panels.ts`, `sound.ts`, `state.ts`             | yes                             | through end-to-end tests |

`main.ts` in each chapter is the composition root: it creates the scene, the player and the panels, and wires them to the page's markup. It holds no algorithm logic.

### Core modules

| Module                 | What it does                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `player.ts`            | The step player: play, pause, step, seek, speed, rewind, load a new program mid-way.                         |
| `stage.ts`             | Three.js renderer, lights, orbit controls, and a framer that keeps the piece in the free part of the screen. |
| `controls.ts`          | Transport bar, narration placard, keyboard shortcuts, help card, callout.                                    |
| `glyphs.ts`            | Wire numerals, capitals and a few lowercase letters, drawn as strokes on canvas or SVG, never typeset.       |
| `labels.ts`            | Every glyph, pill and ring in a scene in one instanced draw call, depth-sorted.                              |
| `instances.ts`         | Instanced rods, balls, cones and camera-facing discs: the wire-work a sculpture is made of.                  |
| `color.ts`             | The design tokens as sRGB triples for the scenes, and colour blending.                                       |
| `sound.ts`             | Small procedural sounds; each chapter maps its steps onto them.                                              |
| `math.ts`, `random.ts` | Easing, blending, and a seeded random generator.                                                             |
| `prefs.ts`             | Reduced motion and viewport checks, safe outside a browser.                                                  |
| `test-hooks.ts`        | Exposes internals as `window.__<chapter>` in the end-to-end build only.                                      |
| `dom.ts`               | `byId()`, which throws if the markup is missing an element.                                                  |

## Pages and the build

- `src/site/chapters.ts` is the single list of chapters. The landing page, the navigation, the build inputs and the sitemap all read from it.
- Each live chapter has `<slug>/index.html` (markup only) that loads `/src/chapters/<slug>/main.ts` and one stylesheet, `/src/chapters/<slug>/<slug>.css`.
- Every page stylesheet starts with `@import` of `src/styles/tokens.css`, so the shared rules always come first in the cascade.
- `vite.config.ts` builds one entry per page, puts Three.js in its own long-cached chunk, and writes `sitemap.xml` and `robots.txt` for `VITE_SITE_URL`.
- `%VITE_SITE_URL%` in HTML (canonical links, Open Graph tags) is replaced at build time from `.env`.

## Security headers

`vercel.json` sets a strict Content-Security-Policy (scripts only from this site, no inline scripts), plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. Built assets under `/assets/` have content hashes and are cached for a year. `vite preview` sends the same headers, so the end-to-end tests run under the real policy and fail on any violation.

## Testing

| Kind       | Where                          | Run with           | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `tests/unit/` (mirrors `src/`) | `npm test`         | Algorithms agree with reference implementations on thousands of random graphs; AVL invariants hold through random operations; lists, arrays, stacks and queues match plain JavaScript arrays doing the same thing; both hash tables match a JavaScript `Set` and keep their probing and chaining invariants; the heap matches a sorted array in both orders, heapify stays within its bound, and it hands out Dijkstra's tickets in exactly Graph Net's order; all six sorts sort every kind of input, the stable ones never let twins cross, and the counts that tell them apart hold (n − 1 on sorted input, every pair for selection sort, O(n²) for quick sort on sorted input); every step starts where the last one rested; the player's state machine; the catalogue is consistent with the pages on disk. |
| End-to-end | `tests/e2e/`                   | `npm run test:e2e` | Every page loads with no console errors under the production CSP; every preset plays to the end in every mode; editing works; list operations, the stack and queue orders and the bridge to Graph Net work; heap pushes, pops, heapify, the max-heap flip and Dijkstra's queue play through; the six sorts weave and stand up, one sort plays with its code, twins show which sorts are stable, and the three views work; the phone layout works.                                                                                                                                                                                                                                                                                                                                                                 |

The end-to-end suite builds with `--mode e2e` (which sets `VITE_TEST_HOOKS=true`) and serves it with `vite preview`. Production builds never include the hooks. CI machines have no GPU, so WebGL runs in software at a few frames a second; CI runs the suite in a single worker (about half an hour) because two software-rendering browsers at once starve each other.

Tests import source through the `@/` alias (`@/core/player`, `@/chapters/avl/engine`). Source files import each other with relative paths.

## Adding a chapter

Say the new chapter is No. 7, slug `trie`. Sorting Loom (`src/chapters/sorting/`) is the most recent worked example.

1. **Catalogue.** In `src/site/chapters.ts`, set `live: true` and fill in `short`, `topic`, `blurb` and `tags`. The unit test in `tests/unit/site/chapters.test.ts` fails until steps 2 and 3 are done.
2. **Page.** Create `trie/index.html`, markup only. Copy the head from `sorting/index.html` and change the title (it must start with the chapter's title), description, canonical and Open Graph URLs (`%VITE_SITE_URL%/trie/`). Keep the shared ids (`stage`, `dock`, `masthead`, `placard`, `transport`, `tools`, `help`) so the core controls work.
3. **Code.** Create `src/chapters/trie/`:
   - the model: the structure, its operations, and a recorder that returns `Step[]` snapshots (no DOM, no Three.js);
   - the motion: `poses.ts` with a rest pose per step and `buildTransition(prog, i)` / `morph(a, b, dur)` for the player;
   - the view: `scene.ts` that draws any pose, plus panels if needed;
   - `main.ts` that wires them to the player, `mountNav({ current: 'trie' })`, the transport and the placard;
   - `trie.css`, starting with `@import '../../styles/tokens.css';`;
   - test hooks via `exposeTestHooks('__trie', { player, ... })`.
   - Scenes draw with the shared `WireKit` (`core/instances.ts`) and `LabelBatch` (`core/labels.ts`) rather than their own meshes.
4. **Thumbnail.** Replace the sketch for `trie` in `src/home/art.ts`, and add the page to the static links in `index.html` and `404.html`. Check the card grid in `src/home/home.css`: live cards sit two to a row, studio cards (a quarter wide) fill the row after an odd one out, and a studio card alone after an even row takes half of it. Add a figure to the hero's vitrine too (its last row holds three smaller pieces), and keep it about as tall as the copy beside it.
5. **Tests.** Add `tests/unit/chapters/trie/` (model against a reference, motion continuity) and an end-to-end spec in `tests/e2e/`. Add the page to the `CHAPTERS` list in `tests/e2e/pages.spec.ts` and the phone spec, update the chapter counts there, and add the hook to `tests/e2e/support/hooks.d.ts` and `waitForChapter`.

The build picks up the new page, the navigation and the sitemap from the catalogue; there is no other list to update.

## Conventions

- Strict TypeScript. `erasableSyntaxOnly` is on, so no enums, namespaces or constructor parameter properties.
- ESLint (`eslint.config.js`) for correctness and Prettier (`.prettierrc.json`) for formatting. CI runs both.
- UI text is plain English; captions explain why, not just what.
- Sizes in the 3D scenes are world units, and each chapter keeps its sizes and colours in one file (`palette.ts`, `layout.ts`).
- Anything the viewer can see should work with reduced motion, and with keyboard and touch.
