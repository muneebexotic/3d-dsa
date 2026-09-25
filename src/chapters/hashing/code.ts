// The code each operation runs, shown beside the sculpture with the current line
// lit. Pseudocode, close to what an interviewer would expect on a whiteboard.

export const CODE = {
  'chain.put': [
    'i = hash(k) % m',
    'node = bucket[i]',
    'while node != null:',
    '  if node.key == k: return',
    '  node = node.next',
    'append k to bucket[i]',
    'n += 1',
    'if n > ¾ × m: grow()',
  ],
  'chain.get': [
    'i = hash(k) % m',
    'node = bucket[i]',
    'while node != null:',
    '  if node.key == k: found',
    '  node = node.next',
    '// not found',
  ],
  'chain.remove': [
    'i = hash(k) % m',
    'node = bucket[i]',
    'while node != null:',
    '  if node.key == k:',
    '    unlink node',
    '    n −= 1; return',
    '  node = node.next',
    '// not found',
  ],
  'probe.put': [
    'i = hash(k) % m',
    'while slot[i] != EMPTY:',
    '  if slot[i] == k: return',
    '  i = (i + 1) % m',
    'slot[i] = k  // or 1st DEL',
    'n += 1',
    'if n > ¾ × m: grow()',
  ],
  'probe.get': [
    'i = hash(k) % m',
    'while slot[i] != EMPTY:',
    '  if slot[i] == k: found',
    '  i = (i + 1) % m',
    '// not found',
  ],
  'probe.remove': [
    'i = hash(k) % m',
    'while slot[i] != EMPTY:',
    '  if slot[i] == k:',
    '    slot[i] = DEL',
    '    n −= 1; return',
    '  i = (i + 1) % m',
    '// not found',
  ],
  grow: [
    'old = table',
    'table = new array(2 × m)',
    'for each key k in old:',
    '  put(k)  // new hash % 2m',
    'free(old)',
  ],
  rehash: [
    'old = table',
    'hash = new hash function',
    'table = new array(m)',
    'for each key k in old:',
    '  put(k)',
    'free(old)',
  ],
} as const satisfies Record<string, readonly string[]>;

export type CodeKey = keyof typeof CODE;

/** What a listing is called in the code card. */
export function codeTitle(key: CodeKey): string {
  const title: Record<CodeKey, string> = {
    'chain.put': 'put(k) · chaining',
    'chain.get': 'get(k) · chaining',
    'chain.remove': 'remove(k) · chaining',
    'probe.put': 'put(k) · probing',
    'probe.get': 'get(k) · probing',
    'probe.remove': 'remove(k) · probing',
    grow: 'grow()',
    rehash: 'rehash()',
  };
  return title[key];
}
