// The catalogue of chapters, and the navigation every page shares.
// `root` is the path from the current page back to the site root ('../' in a chapter, './' on the landing page).

export const SITE = '3D Data Structures';
export const CHAPTERS = [
  { no: 1, slug: 'avl', title: 'AVL Mobile', short: 'AVL', topic: 'Trees', live: true,
    blurb: 'A self-balancing search tree hung as a mobile. Every arm tilts toward its taller side, and a rotation is a see-saw.',
    tags: ['LL · RR · LR · RL', 'O(log n)'] },
  { no: 2, slug: 'graphs', title: 'Graph Net', short: 'Graphs', topic: 'Graphs', live: true,
    blurb: 'BFS spreads as a ripple, DFS dives on a single thread, and Dijkstra lifts the net off its plinth in order of distance.',
    tags: ['BFS · DFS · Dijkstra', 'Race mode'] },
  { no: 3, slug: 'lists', title: 'Lists, stacks & queues', short: 'Lists', topic: 'Linear structures', live: false,
    blurb: 'Pointers you can follow by hand, and the two disciplines, last in first out and first in first out, that the graph chapter leans on.' },
  { no: 4, slug: 'hashing', title: 'Hash table', short: 'Hashing', topic: 'Hashing', live: false,
    blurb: 'Keys dropped into buckets, collisions chained or probed, and a resize you can watch happen.' },
  { no: 5, slug: 'heap', title: 'Heap', short: 'Heap', topic: 'Priority queues', live: false,
    blurb: 'The structure inside Dijkstra’s priority queue: sift up, sift down, and why the smallest item is always on top.' },
  { no: 6, slug: 'sorting', title: 'Sorting', short: 'Sorting', topic: 'Algorithms', live: false,
    blurb: 'Insertion, merge, quick and heap sort racing on the same bars.' },
  { no: 7, slug: 'trie', title: 'Trie', short: 'Trie', topic: 'Strings', live: false,
    blurb: 'Words sharing their beginnings, one letter per branch.' },
];

// Desktop: a pill row inside the dock. Phone: a menu button in #tools.
export function mountNav({ current, root = '../', dock = document.getElementById('dock'), tools = document.getElementById('tools') }) {
  const live = CHAPTERS.filter(c => c.live);
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Chapters');
  nav.innerHTML = `<a class="home" href="${root}">${SITE}</a>` + live.map(c =>
    `<a href="${root}${c.slug}/"${c.slug === current ? ' aria-current="page"' : ''}>No. ${c.no} · ${c.short}</a>`).join('');
  dock.prepend(nav);

  const btn = document.createElement('button');
  btn.className = 'icon'; btn.id = 'bNav'; btn.type = 'button';
  btn.setAttribute('aria-label', 'Chapters'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'navMenu');
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';
  tools.prepend(btn);
  const menu = document.createElement('div');
  menu.id = 'navMenu'; menu.className = 'card'; menu.hidden = true;
  menu.innerHTML = `<a href="${root}"><b>${SITE}</b><span>All chapters</span></a>` + CHAPTERS.map(c => c.live
    ? `<a href="${root}${c.slug}/"${c.slug === current ? ' aria-current="page"' : ''}><b>No. ${c.no} · ${c.title}</b><span>${c.topic}</span></a>`
    : `<a class="soon" aria-disabled="true"><b>No. ${c.no} · ${c.title}</b><span>In the studio</span></a>`).join('');
  document.body.appendChild(menu);
  const set = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', e => { e.stopPropagation(); set(menu.hidden); });
  addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) set(false); });
  return { close: () => set(false) };
}
