/** The element with this id. Throws if the page markup is missing it, so mistakes fail loudly. */
export function byId<T extends Element = HTMLElement>(id: string): T {
  const el: Element | null = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in the page markup`);
  return el as T;
}
