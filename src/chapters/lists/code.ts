// The code each operation runs, shown beside the sculpture with the current line
// lit. Pseudocode, close to what an interviewer would expect on a whiteboard.

export const CODE = {
  'array.get': ['return a[i]', '// address = base + 4 × i'],
  'array.search': ['for i from 0 to len − 1:', '  if a[i] == v: return i', 'return −1'],
  'array.insert': [
    'if len == cap:',
    '  b = new array(2 × cap)',
    '  copy a[0 … len−1] into b',
    '  a = b',
    'for j from len down to i + 1:',
    '  a[j] = a[j − 1]',
    'a[i] = v',
    'len += 1',
  ],
  'array.delete': ['v = a[i]', 'for j from i to len − 2:', '  a[j] = a[j + 1]', 'len −= 1'],
  'array.reverse': ['L = 0; R = len − 1', 'while L < R:', '  swap a[L], a[R]', '  L += 1; R −= 1'],

  'singly.insertHead': ['node = new Node(v)', 'node.next = head', 'head = node', 'if tail == null: tail = node'],
  'singly.insertTail': ['node = new Node(v)', 'if tail: tail.next = node', 'else: head = node', 'tail = node'],
  'singly.insertAt': [
    'cur = head',
    'repeat i − 1 times:',
    '  cur = cur.next',
    'node = new Node(v)',
    'node.next = cur.next',
    'cur.next = node',
  ],
  'singly.deleteAt': [
    'if i == 0:',
    '  gone = head',
    '  head = gone.next',
    '  if head == null: tail = null',
    'else:',
    '  cur = head',
    '  repeat i − 1: cur = cur.next',
    '  gone = cur.next',
    '  cur.next = gone.next',
    '  if gone == tail: tail = cur',
    'free(gone)',
  ],
  'singly.search': [
    'cur = head; i = 0',
    'while cur != null:',
    '  if cur.value == v: return i',
    '  cur = cur.next; i += 1',
    'return −1',
  ],
  'singly.get': ['cur = head', 'repeat i times:', '  cur = cur.next', 'return cur.value'],
  'singly.reverse': [
    'prev = null',
    'cur = head',
    'while cur != null:',
    '  next = cur.next',
    '  cur.next = prev',
    '  prev = cur',
    '  cur = next',
    'tail = head',
    'head = prev',
  ],

  'doubly.insertHead': [
    'node = new Node(v)',
    'node.next = head',
    'if head: head.prev = node',
    'else: tail = node',
    'head = node',
  ],
  'doubly.insertTail': [
    'node = new Node(v)',
    'node.prev = tail',
    'if tail: tail.next = node',
    'else: head = node',
    'tail = node',
  ],
  'doubly.insertAt': [
    'if i ≤ n / 2:',
    '  cur = head',
    '  repeat i − 1: cur = cur.next',
    'else:',
    '  cur = tail',
    '  repeat n − i: cur = cur.prev',
    'node = new Node(v)',
    'node.next = cur.next',
    'node.prev = cur',
    'cur.next.prev = node',
    'cur.next = node',
  ],
  'doubly.deleteAt': [
    'if i < n / 2:',
    '  gone = head',
    '  repeat i: gone = gone.next',
    'else:',
    '  gone = tail',
    '  repeat n−1−i:',
    '    gone = gone.prev',
    'if gone.prev:',
    '  gone.prev.next = gone.next',
    'else: head = gone.next',
    'if gone.next:',
    '  gone.next.prev = gone.prev',
    'else: tail = gone.prev',
    'free(gone)',
  ],
  'doubly.search': [
    'cur = head; i = 0',
    'while cur != null:',
    '  if cur.value == v: return i',
    '  cur = cur.next; i += 1',
    'return −1',
  ],
  'doubly.get': [
    'if i < n / 2:',
    '  cur = head',
    '  repeat i: cur = cur.next',
    'else:',
    '  cur = tail',
    '  repeat n−1−i: cur = cur.prev',
    'return cur.value',
  ],
  'doubly.reverse': [
    'cur = head',
    'while cur != null:',
    '  swap cur.next, cur.prev',
    '  cur = cur.prev  // old next',
    'swap head, tail',
  ],

  'stack.push': ['node = new Node(v)', 'node.next = top', 'top = node'],
  'stack.pop': ['if top == null: underflow', 'v = top.value', 'top = top.next', 'return v'],
  'stack.peek': ['if top == null: underflow', 'return top.value'],

  'queue.enqueue': ['if size == cap: overflow', 'a[back] = v', 'back = (back + 1) % cap', 'size += 1'],
  'queue.dequeue': ['if size == 0: underflow', 'v = a[front]', 'front = (front + 1) % cap', 'size −= 1', 'return v'],
  'queue.peek': ['if size == 0: underflow', 'return a[front]'],

  'bridge.search': [
    'put(start)',
    'while box is not empty:',
    '  x = take()',
    '  if x is visited: continue',
    '  visit(x)',
    '  for y in neighbors(x):',
    '    if y not visited: put(y)',
  ],
} as const satisfies Record<string, readonly string[]>;

export type CodeKey = keyof typeof CODE;

/** What a listing is called in the code card. */
export function codeTitle(key: CodeKey): string {
  const [who, what] = key.split('.');
  const name: Record<string, string> = {
    get: 'get(i)',
    search: 'search(v)',
    insert: 'insert(i, v)',
    delete: 'delete(i)',
    reverse: 'reverse()',
    insertHead: 'insertHead(v)',
    insertTail: 'insertTail(v)',
    insertAt: 'insertAt(i, v)',
    deleteAt: 'deleteAt(i)',
    push: 'push(v)',
    pop: 'pop()',
    peek: 'peek()',
    enqueue: 'enqueue(v)',
    dequeue: 'dequeue()',
  };
  if (who === 'bridge') return 'search(start)';
  return name[what] ?? what;
}
