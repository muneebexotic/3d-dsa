// Pseudocode for each operation, short enough for the side card. A step names
// the listing and the line it is running.

export type CodeKey = 'node' | 'search' | 'insert' | 'remove' | 'complete' | 'spell';

export const TITLES: Readonly<Record<CodeKey, string>> = {
  node: 'class Node',
  search: 'search(word)',
  insert: 'insert(word)',
  remove: 'remove(word)',
  complete: 'complete(prefix)',
  spell: 'suggest(word)',
};

export const LISTINGS: Readonly<Record<CodeKey, readonly string[]>> = {
  node: ['class Node:', '  next = [26 slots]  // A..Z', '  isWord = false', '', 'root = Node()  // no letter'],
  search: [
    'node = root',
    'for ch in word:',
    '  node = node.next[ch]',
    '  if node is null:',
    '    return false  // no path',
    'return node.isWord',
  ],
  insert: [
    'node = root',
    'for ch in word:',
    '  if node.next[ch] is null:',
    '    node.next[ch] = Node()',
    '  node = node.next[ch]',
    'node.isWord = true',
  ],
  remove: [
    'path = nodes along word',
    'if no path or not isWord:',
    '  return',
    'last.isWord = false',
    'for node in path, back:',
    '  if node.isWord or kids:',
    '    stop  // still needed',
    '  unlink node',
  ],
  complete: [
    'node = root',
    'for ch in prefix:',
    '  node = node.next[ch]',
    '  if node is null:',
    '    return []',
    'return words below node',
    '  // A to Z: slot order',
  ],
  spell: [
    'row = [0, 1, .., len]',
    'visit(root, row)',
    'visit(node, row):',
    '  for each child ch:',
    '    r = next row for ch',
    '    if ch.isWord, r[len]<=1:',
    '      suggest it',
    '    if min(r) <= 1:',
    '      visit(ch, r)',
    '    else: cut the branch',
  ],
};
