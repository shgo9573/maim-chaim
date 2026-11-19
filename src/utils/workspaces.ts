import type { Tab, Workspace } from '../types';

export type WorkspaceNameError = 'empty' | 'too-long' | 'duplicate';

let workspaceIdCounter = 0;

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0591-\u05C7]/g, '').trim().toLocaleLowerCase();
}

export function createWorkspaceId(): string {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${workspaceIdCounter++}`;
  return `workspace-${token}`;
}

export function uniqueWorkspaceName(workspaces: readonly Workspace[]): string {
  const names = new Set(workspaces.map((workspace) => normalizeName(workspace.name)));
  let index = 1;
  while (names.has(normalizeName(`שולחן עבודה ${index}`))) index += 1;
  return `שולחן עבודה ${index}`;
}

export function validateWorkspaceName(value: string, workspaces: readonly Workspace[], exceptId?: string): WorkspaceNameError | null {
  const name = value.trim();
  if (!name) return 'empty';
  if (name.length > 60) return 'too-long';
  const normalized = normalizeName(name);
  return workspaces.some((workspace) => workspace.id !== exceptId && normalizeName(workspace.name) === normalized)
    ? 'duplicate'
    : null;
}

function isWorkspaceTab(value: unknown): value is Tab {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Tab>;
  return typeof candidate.id === 'string' &&
    (candidate.kind === 'book' || candidate.kind === 'search' || candidate.kind === 'tzurat-hadaf');
}

export function normalizeWorkspaceList(value: unknown): Workspace[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const result: Workspace[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<Workspace>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!id || !name || ids.has(id)) continue;
    ids.add(id);
    const tabs = Array.isArray(candidate.tabs) ? candidate.tabs.filter(isWorkspaceTab) : [];
    const activeTabId = typeof candidate.activeTabId === 'string' && tabs.some((tab) => tab.id === candidate.activeTabId)
      ? candidate.activeTabId
      : tabs[0]?.id ?? null;
    result.push({ id, name, tabs: cloneWorkspaceTabs(tabs), activeTabId, isPinned: candidate.isPinned === true });
  }
  return result;
}

export function cloneWorkspaceTabs(tabs: readonly Tab[]): Tab[] {
  return JSON.parse(JSON.stringify(tabs)) as Tab[];
}

export function snapshotWorkspace(workspace: Workspace, tabs: readonly Tab[], activeTabId: string | null): Workspace {
  const clonedTabs = cloneWorkspaceTabs(tabs);
  const safeActiveTabId = activeTabId && clonedTabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : clonedTabs[0]?.id ?? null;
  return { ...workspace, tabs: clonedTabs, activeTabId: safeActiveTabId };
}

export interface MoveWorkspaceTabsResult {
  workspaces: Workspace[];
  remainingTabs: Tab[];
  nextActiveTabId: string | null;
  movedTabs: Tab[];
}

export function moveTabsBetweenWorkspaces(
  workspaces: readonly Workspace[],
  sourceWorkspaceId: string,
  liveTabs: readonly Tab[],
  activeTabId: string | null,
  tabIds: readonly string[],
  targetWorkspaceId: string,
): MoveWorkspaceTabsResult | null {
  if (sourceWorkspaceId === targetWorkspaceId || tabIds.length === 0) return null;
  const source = workspaces.find((workspace) => workspace.id === sourceWorkspaceId);
  const target = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
  if (!source || !target) return null;
  const requested = new Set(tabIds);
  const movedTabs = liveTabs.filter((tab) => requested.has(tab.id));
  if (movedTabs.length === 0) return null;

  const remainingTabs = liveTabs.filter((tab) => !requested.has(tab.id));
  const activeIndex = liveTabs.findIndex((tab) => tab.id === activeTabId);
  const activeWasMoved = activeTabId !== null && requested.has(activeTabId);
  const nextActiveTabId = activeWasMoved
    ? remainingTabs[Math.min(Math.max(activeIndex, 0), remainingTabs.length - 1)]?.id ?? null
    : activeTabId && remainingTabs.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : remainingTabs[0]?.id ?? null;

  const existingTargetIds = new Set(target.tabs.map((tab) => tab.id));
  const additions = cloneWorkspaceTabs(movedTabs).filter((tab) => !existingTargetIds.has(tab.id));
  const nextWorkspaces = workspaces.map((workspace) => {
    if (workspace.id === sourceWorkspaceId) {
      return workspace.isPinned ? workspace : snapshotWorkspace(workspace, remainingTabs, nextActiveTabId);
    }
    if (workspace.id === targetWorkspaceId) {
      return { ...workspace, tabs: [...cloneWorkspaceTabs(workspace.tabs), ...additions] };
    }
    return workspace;
  });

  return { workspaces: nextWorkspaces, remainingTabs: [...remainingTabs], nextActiveTabId, movedTabs: cloneWorkspaceTabs(movedTabs) };
}
