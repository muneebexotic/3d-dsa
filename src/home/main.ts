// The landing page: the hero drawings, the catalogue of chapters (closed by a
// colophon once every work is on the wall), and the header that gains a rule once
// the page scrolls.

import { byId } from '../core/dom';
import { CHAPTERS, LIVE_CHAPTERS, chapterPath, type Chapter } from '../site/chapters';
import {
  THUMBNAILS,
  colophonSVG,
  drawChain,
  drawClock,
  drawLoom,
  drawMobile,
  drawNet,
  drawPyramid,
  drawSunburst,
} from './art';

function card(c: Chapter): string {
  const body = `<div class="thumb"><svg data-t="${c.slug}" viewBox="${c.live ? '0 0 480 220' : '0 0 320 200'}" aria-hidden="true"></svg></div>
    <div class="cbody"><div class="eyebrow">No. ${c.no} · ${c.live ? c.topic : 'In the studio'}</div><h3>${c.title}</h3><p>${c.blurb}</p>
    ${c.tags ? `<div class="ctags">${c.tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
    <div class="open">${c.live ? 'Open →' : `Coming soon · ${c.topic}`}</div></div>`;
  return c.live
    ? `<li class="live"><a class="cardx" href="${chapterPath(c.slug)}" aria-label="No. ${c.no}: ${c.title}">${body}</a></li>`
    : `<li class="soon"><div class="cardx" aria-disabled="true">${body}</div></li>`;
}

/** The last card, once the collection is complete: what the seven works share, and the way back to the first. */
function colophon(): string {
  return `<li class="colophon"><div class="cardx"><div class="thumb">${colophonSVG(LIVE_CHAPTERS.map(c => c.no))}</div>
    <div class="cbody"><div class="eyebrow">The collection · complete</div><h3>Seven works, one method.</h3>
    <p>Each runs its algorithm first and keeps every step, then performs the steps as a sculpture you can pause, rewind and turn round. In order, they go from a tree that balances numbers to a tree that spells words, by way of a net, a chain, a clock, a pyramid and a loom.</p>
    <div class="ctags"><span>${LIVE_CHAPTERS.length} chapters</span><span>Every step rewindable</span></div>
    <a class="open" href="${chapterPath(CHAPTERS[0].slug)}">Begin again at No. 1 →</a></div></div></li>`;
}

const cards = byId<HTMLOListElement>('cards');
cards.innerHTML = CHAPTERS.map(card).join('') + (CHAPTERS.every(c => c.live) ? colophon() : '');
for (const svg of cards.querySelectorAll<SVGSVGElement>('svg[data-t]')) THUMBNAILS[svg.dataset.t ?? '']?.(svg);

drawMobile(byId<SVGSVGElement>('artMobile'));
drawNet(byId<SVGSVGElement>('artNet'));
drawChain(byId<SVGSVGElement>('artChain'), { W: 640, H: 200 });
drawClock(byId<SVGSVGElement>('artClock'), { W: 320, H: 250 });
drawPyramid(byId<SVGSVGElement>('artPyramid'), { W: 320, H: 250 });
drawLoom(byId<SVGSVGElement>('artLoom'), { W: 320, H: 250 });
drawSunburst(byId<SVGSVGElement>('artSunburst'), { W: 320, H: 250 });

const top = byId('top');
addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 8), { passive: true });
