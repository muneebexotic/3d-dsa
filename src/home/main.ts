// The landing page: the hero drawings, the catalogue of chapters, and the header
// that gains a rule once the page scrolls.

import { byId } from '../core/dom';
import { CHAPTERS, chapterPath, type Chapter } from '../site/chapters';
import { THUMBNAILS, drawMobile, drawNet } from './art';

function card(c: Chapter): string {
  const body = `<div class="thumb"><svg data-t="${c.slug}" viewBox="${c.live ? '0 0 480 220' : '0 0 320 200'}" aria-hidden="true"></svg></div>
    <div class="cbody"><div class="eyebrow">No. ${c.no} · ${c.live ? c.topic : 'In the studio'}</div><h3>${c.title}</h3><p>${c.blurb}</p>
    ${c.tags ? `<div class="ctags">${c.tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
    <div class="open">${c.live ? 'Open →' : `Coming soon · ${c.topic}`}</div></div>`;
  return c.live
    ? `<li class="live"><a class="cardx" href="${chapterPath(c.slug)}" aria-label="No. ${c.no}: ${c.title}">${body}</a></li>`
    : `<li class="soon"><div class="cardx" aria-disabled="true">${body}</div></li>`;
}

const cards = byId<HTMLOListElement>('cards');
cards.innerHTML = CHAPTERS.map(card).join('');
for (const svg of cards.querySelectorAll<SVGSVGElement>('svg[data-t]')) THUMBNAILS[svg.dataset.t ?? '']?.(svg);

drawMobile(byId<SVGSVGElement>('artMobile'));
drawNet(byId<SVGSVGElement>('artNet'));

const top = byId('top');
addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 8), { passive: true });
