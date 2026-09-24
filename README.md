# 3D Data Structures

An exhibition of algorithms in motion. Each chapter turns one data structure into a 3D piece you can orbit, step through and rewind. Every step comes with a plain-English caption.

| No. | Chapter | Status |
| --- | --- | --- |
| 1 | [AVL Mobile](avl/): a self-balancing tree hung as a mobile, with LL, RR, LR and RL rotations | live |
| 2 | [Graph Net](graphs/): BFS, DFS and Dijkstra on a net of strings, with race mode and a graph editor | live |
| 3 | Lists, stacks & queues | in the studio |
| 4 | Hash table | in the studio |
| 5 | Heap | in the studio |
| 6 | Sorting | in the studio |
| 7 | Trie | in the studio |

## Layout

```
index.html          landing page and catalogue
avl/index.html      No. 1, AVL Mobile
graphs/index.html   No. 2, Graph Net (scene, poses, panels, editing)
graphs/algo.js      graph model, presets, BFS / DFS / Dijkstra step recorders
shared/tokens.css   design tokens and the shared gallery UI
shared/player.js    step player: play, pause, step, seek, speed, rewind
shared/controls.js  transport bar, narration placard, keys, help card, callout
shared/stage.js     Three.js renderer, lights, orbit controls, auto-framing camera
shared/nav.js       chapter catalogue and the navigation every page shares
shared/glyphs.js    wire glyphs: numerals and capitals drawn as strokes
shared/sound.js     small procedural sounds
```

Each algorithm runs instantly and records its steps. A chapter describes each step as a motion `pose(t)`, and the shared player plays those motions forward, or backward to rewind.

## Running it

It is a static site with no build step. ES modules need to be served over HTTP, so from the repository root run any static server:

```
python3 -m http.server 8000
```

Then open http://localhost:8000/. Three.js loads from jsDelivr. GitHub Pages can serve the repository root as it is.
