import type { BookItem, CatalogData, CategoryNode } from '../types';
import { isExcludedBook, isExcludedCategory, rememberExcludedBookId } from './bookFilter';

export interface LibNode {
  name: string;
  path: string;
  children: LibNode[];
  books: BookItem[];
  count: number;
}

export interface Library {
  root: LibNode;
  books: BookItem[];
  byId: Map<string, BookItem>;
  byTitle: Map<string, BookItem>;
  nodes: Map<string, LibNode>;
}

export function buildLibrary(data: CatalogData): Library {
  const root: LibNode = { name: 'ספרייה', path: '', children: [], books: [], count: 0 };
  const nodes = new Map<string, LibNode>();
  nodes.set('', root);
  const seen = new Set<string>();
  const all: BookItem[] = [];

  const ensure = (path: string): LibNode => {
    const clean = (path || '').split('/').map((s) => s.trim()).filter(Boolean);
    let cur = root;
    let acc = '';
    for (const seg of clean) {
      acc = acc ? acc + '/' + seg : seg;
      let n = nodes.get(acc);
      if (!n) {
        n = { name: seg, path: acc, children: [], books: [], count: 0 };
        nodes.set(acc, n);
        cur.children.push(n);
      }
      cur = n;
    }
    return cur;
  };

  const addBook = (node: LibNode, b: BookItem) => {
    const key = String(b.id);
    if (isExcludedBook(b)) {
      rememberExcludedBookId(b.id);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    node.books.push(b);
    all.push(b);
  };

  // When the source itself is blocked, record every descendant ID before
  // removing that branch. The same books may also appear in data.books flat.
  const rememberCategoryBooks = (category: CategoryNode) => {
    for (const b of category.books || []) rememberExcludedBookId(b.id);
    for (const child of category.children || []) rememberCategoryBooks(child);
  };

  const walk = (cats: CategoryNode[], parentPath: string) => {
    for (const c of cats || []) {
      const path = c.path && c.path.length ? c.path : parentPath ? parentPath + '/' + c.name : c.name;
      if (isExcludedCategory(path) || isExcludedCategory(c.name)) {
        rememberCategoryBooks(c);
        continue;
      }
      const node = ensure(path);
      for (const b of c.books || []) addBook(node, { ...b, categoryPath: b.categoryPath || path });
      if (c.children?.length) walk(c.children, path);
    }
  };
  walk(data.categories || [], '');

  for (const b of data.books || []) {
    addBook(ensure(b.categoryPath || b.heCategories || ''), b);
  }

  const finish = (n: LibNode): number => {
    n.books.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    let c = n.books.length;
    for (const ch of n.children) c += finish(ch);
    n.count = c;
    return c;
  };
  finish(root);

  const byId = new Map<string, BookItem>();
  const byTitle = new Map<string, BookItem>();
  for (const b of all) {
    byId.set(String(b.id), b);
    if (!byTitle.has(b.title)) byTitle.set(b.title, b);
  }
  return { root, books: all, byId, byTitle, nodes };
}
