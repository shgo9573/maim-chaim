import type { TocEntry } from '../types';

export interface TocTreeNode {
  entry: TocEntry;
  children: TocTreeNode[];
  depth: number;
  firstChildChain: boolean;
  matchesFilter?: boolean;
}

export interface TocVisibleRow {
  node: TocTreeNode;
  expanded: boolean;
}

function plainTitle(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function rebaseTree(
  nodes: TocTreeNode[],
  depth: number,
  parentIsFirstChild: boolean,
): TocTreeNode[] {
  return nodes.map((node, index) => {
    const firstChildChain = parentIsFirstChild && index === 0;
    return {
      ...node,
      depth,
      firstChildChain,
      children: rebaseTree(node.children, depth + 1, firstChildChain),
    };
  });
}

/** Builds the hierarchical TOC from the flat API entries. */
export function buildTocTree(entries: TocEntry[], bookTitle?: string): TocTreeNode[] {
  const roots: TocTreeNode[] = [];
  const stack: Array<{ level: number; node: TocTreeNode }> = [];

  for (const entry of entries) {
    const level = Math.max(1, Math.floor(entry.level ?? 1));
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.node;
    const node: TocTreeNode = {
      entry,
      children: [],
      depth: parent ? parent.depth + 1 : 0,
      firstChildChain: parent
        ? parent.firstChildChain && parent.children.length === 0
        : roots.length === 0,
    };

    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push({ level, node });
  }

  if (
    bookTitle &&
    roots.length === 1 &&
    roots[0].children.length > 0 &&
    plainTitle(roots[0].entry.title) === plainTitle(bookTitle)
  ) {
    return rebaseTree(roots[0].children, 0, true);
  }

  return roots;
}

/** Default view: open every top-level branch and the first-child path. */
export function getDefaultTocExpansion(nodes: TocTreeNode[]): Set<number> {
  const expanded = new Set<number>();
  const visit = (items: TocTreeNode[]) => {
    for (const node of items) {
      if (node.children.length > 0 && (node.depth === 0 || node.firstChildChain)) {
        expanded.add(node.entry.index);
      }
      visit(node.children);
    }
  };
  visit(nodes);
  return expanded;
}

/** Returns the exact expansion state used by the source app's depth menu. */
export function getTocExpansionForLevel(
  nodes: TocTreeNode[],
  level: number,
): Set<number> {
  const expanded = new Set<number>();
  if (level === 0) {
    const expandAll = (items: TocTreeNode[]) => {
      for (const node of items) {
        if (node.children.length > 0) expanded.add(node.entry.index);
        expandAll(node.children);
      }
    };
    expandAll(nodes);
    return expanded;
  }

  // A single chain above the actual book sections stays open, matching Otzaria.
  let visibleRoots = nodes;
  while (visibleRoots.length === 1 && visibleRoots[0].children.length > 0) {
    expanded.add(visibleRoots[0].entry.index);
    visibleRoots = visibleRoots[0].children;
  }

  const visit = (items: TocTreeNode[], depth: number) => {
    for (const node of items) {
      if (node.children.length > 0 && depth < level) expanded.add(node.entry.index);
      visit(node.children, depth + 1);
    }
  };
  visit(visibleRoots, 1);
  return expanded;
}

/** Flattens only rows whose ancestors are open; suitable for a virtual list. */
export function flattenVisibleToc(
  nodes: TocTreeNode[],
  expanded: Set<number>,
): TocVisibleRow[] {
  const rows: TocVisibleRow[] = [];
  const visit = (items: TocTreeNode[]) => {
    for (const node of items) {
      const isExpanded = node.children.length > 0 && expanded.has(node.entry.index);
      rows.push({ node, expanded: isExpanded });
      if (isExpanded) visit(node.children);
    }
  };
  visit(nodes);
  return rows;
}

/** Keeps matching headings and their ancestors, without changing their order. */
export function filterTocTree(
  nodes: TocTreeNode[],
  normalizedQuery: string,
  normalizeText: (value: string) => string,
): TocTreeNode[] {
  if (!normalizedQuery) return nodes;
  const result: TocTreeNode[] = [];
  for (const node of nodes) {
    const children = filterTocTree(node.children, normalizedQuery, normalizeText);
    const matchesFilter = normalizeText(plainTitle(node.entry.title)).includes(normalizedQuery);
    if (!matchesFilter && children.length === 0) continue;
    result.push({ ...node, children, matchesFilter });
  }
  return result;
}

/** Finds the deepest/latest TOC entry at or before the current reading line. */
export function getTocActiveIndex(
  nodes: TocTreeNode[],
  currentLine: number,
): number | null {
  let bestIndex: number | null = null;
  const visit = (items: TocTreeNode[]) => {
    for (const node of items) {
      if (
        node.entry.index <= currentLine &&
        (bestIndex === null || node.entry.index > bestIndex)
      ) {
        bestIndex = node.entry.index;
      }
      visit(node.children);
    }
  };
  visit(nodes);
  return bestIndex;
}

/** Returns the path from the visible roots to the requested entry. */
export function getTocPath(
  nodes: TocTreeNode[],
  targetIndex: number | null,
): TocTreeNode[] {
  if (targetIndex === null) return [];
  const visit = (items: TocTreeNode[], path: TocTreeNode[]): TocTreeNode[] | null => {
    for (const node of items) {
      const nextPath = [...path, node];
      if (node.entry.index === targetIndex) return nextPath;
      const childPath = visit(node.children, nextPath);
      if (childPath) return childPath;
    }
    return null;
  };
  return visit(nodes, []) ?? [];
}

/** If the active entry is hidden, selects its nearest visible ancestor. */
export function getVisibleActiveTocIndex(
  rows: TocVisibleRow[],
  path: TocTreeNode[],
  activeIndex: number | null,
): number | null {
  if (activeIndex === null) return null;
  const visible = new Set(rows.map((row) => row.node.entry.index));
  if (visible.has(activeIndex)) return activeIndex;
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const ancestorIndex = path[index].entry.index;
    if (visible.has(ancestorIndex)) return ancestorIndex;
  }
  return null;
}

/** Maximum visible hierarchy depth, counting the first row as level one. */
export function getTocTreeDepth(nodes: TocTreeNode[]): number {
  let maximum = 0;
  const visit = (items: TocTreeNode[]) => {
    for (const node of items) {
      maximum = Math.max(maximum, node.depth + 1);
      visit(node.children);
    }
  };
  visit(nodes);
  return maximum;
}
