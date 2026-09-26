// The catalogue of chapters. This is the single list the landing page, the
// navigation, the build (one page per live chapter) and the sitemap read from.
// To add a chapter, follow "Adding a chapter" in docs/ARCHITECTURE.md.

export const SITE_NAME = '3D Data Structures';

export interface Chapter {
  no: number;
  /** URL path segment and folder name. */
  slug: string;
  title: string;
  /** Short name for navigation pills. */
  short: string;
  topic: string;
  live: boolean;
  blurb: string;
  tags?: readonly string[];
}

export const CHAPTERS: readonly Chapter[] = [
  {
    no: 1,
    slug: 'avl',
    title: 'AVL Mobile',
    short: 'AVL',
    topic: 'Trees',
    live: true,
    blurb:
      'A self-balancing search tree hung as a mobile. Every arm tilts toward its taller side, and a rotation is a see-saw.',
    tags: ['LL · RR · LR · RL', 'O(log n)'],
  },
  {
    no: 2,
    slug: 'graphs',
    title: 'Graph Net',
    short: 'Graphs',
    topic: 'Graphs',
    live: true,
    blurb:
      'BFS spreads as a ripple, DFS dives on a single thread, and Dijkstra lifts the net off its plinth in order of distance.',
    tags: ['BFS · DFS · Dijkstra', 'Race mode'],
  },
  {
    no: 3,
    slug: 'lists',
    title: 'Pointer Chain',
    short: 'Lists',
    topic: 'Lists, stacks & queues',
    live: true,
    blurb:
      'Every pointer is a wire. Rewire a linked list, watch each wire turn round in a reverse, and feel a stack give values back in the opposite order from a queue.',
    tags: ['Array · singly · doubly', 'Stack · ring buffer'],
  },
  {
    no: 4,
    slug: 'hashing',
    title: 'Hash Clock',
    short: 'Hashing',
    topic: 'Hash tables',
    live: true,
    blurb:
      'Every key winds round a clock of buckets to its hour. Watch collisions chain or probe, the table double and rehash in a fountain, and unlucky keys turn O(1) into O(n).',
    tags: ['Chaining · probing', 'Load factor · rehash'],
  },
  {
    no: 5,
    slug: 'heap',
    title: 'Heap Pyramid',
    short: 'Heap',
    topic: 'Heaps & priority queues',
    live: true,
    blurb:
      'One array, folded into a tree. Keys climb and sink along a single path, heapify settles a whole pile in O(n), and Dijkstra’s tickets come off the top in order.',
    tags: ['Sift up · sift down', 'Heapify · priority queue'],
  },
  {
    no: 6,
    slug: 'sorting',
    title: 'Sorting Loom',
    short: 'Sorting',
    topic: 'Sorting',
    live: true,
    blurb:
      'Every key is a thread and every comparison weaves a row. Six sorts weave the same threads: the O(n²) cloths come out long, the O(n log n) ones short, and the unstable ones tie knots.',
    tags: ['Bubble · insertion · selection', 'Merge · quick · heap'],
  },
  {
    no: 7,
    slug: 'trie',
    title: 'Trie',
    short: 'Trie',
    topic: 'Strings',
    live: false,
    blurb: 'Words sharing their beginnings, one letter per branch.',
  },
];

export const LIVE_CHAPTERS: readonly Chapter[] = CHAPTERS.filter(c => c.live);

/** Site-absolute path of a chapter page. */
export const chapterPath = (slug: string): string => `/${slug}/`;
