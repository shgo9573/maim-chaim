import { useEffect, useMemo, useState } from 'react';
import { Check, Folder, PanelsTopLeft, Pencil, Pin, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../store';

interface WorkspaceManagerProps { onClose: () => void; }

function normalizeQuery(value: string): string {
  return value.normalize('NFD').replace(/[\u0591-\u05C7]/g, '').trim().toLocaleLowerCase();
}

export default function WorkspaceManager({ onClose }: WorkspaceManagerProps) {
  const {
    workspaces, activeWorkspaceId, tabs, createWorkspace, renameWorkspace, deleteWorkspace,
    switchWorkspace, togglePinWorkspace, saveWorkspaceSnapshot, toast, settings,
  } = useApp();
  const lang = settings.interfaceLanguage || 'he';
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filteredWorkspaces = useMemo(() => {
    const normalized = normalizeQuery(query);
    return normalized ? workspaces.filter((workspace) => normalizeQuery(workspace.name).includes(normalized)) : workspaces;
  }, [query, workspaces]);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setNameDraft(name);
    setDeleteId(null);
  };

  const commitRename = (id: string) => {
    if (!renameWorkspace(id, nameDraft)) {
      toast(lang === 'en' ? 'Enter a unique name of up to 60 characters' : 'יש להזין שם ייחודי באורך של עד 60 תווים');
      return;
    }
    setEditingId(null);
    setNameDraft('');
    toast(lang === 'en' ? 'Workspace name updated' : 'שם שולחן העבודה עודכן');
  };

  const activateWorkspace = (id: string) => {
    if (!switchWorkspace(id)) {
      toast(lang === 'en' ? 'Could not open this workspace' : 'לא ניתן לפתוח את שולחן העבודה');
      return;
    }
    toast(lang === 'en' ? 'Workspace opened' : 'שולחן העבודה נפתח');
    onClose();
  };

  const addWorkspace = () => {
    createWorkspace();
    toast(lang === 'en' ? 'Workspace created' : 'שולחן עבודה חדש נוצר');
  };

  const removeWorkspace = (id: string) => {
    if (!deleteWorkspace(id)) {
      toast(lang === 'en' ? 'The active or last workspace cannot be deleted' : 'לא ניתן למחוק את שולחן העבודה הפעיל או האחרון');
      return;
    }
    setDeleteId(null);
    toast(lang === 'en' ? 'Workspace deleted' : 'שולחן העבודה נמחק');
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title" dir={lang === 'en' ? 'ltr' : 'rtl'} className="fade-in flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface text-on-surface shadow-2xl motion-reduce:animate-none">
        <header className="flex shrink-0 items-center gap-3 border-b border-outline-variant px-4 py-3 md:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-primary"><PanelsTopLeft size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="workspace-manager-title" className="text-lg font-semibold">{lang === 'en' ? 'Workspaces' : 'שולחנות עבודה'}</h2>
            <p className="text-xs text-on-variant">{lang === 'en' ? 'Switch between saved groups of reading tabs' : 'מעבר בין קבוצות שמורות של כרטיסיות עיון'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-on-variant transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none" aria-label={lang === 'en' ? 'Close workspaces' : 'סגור שולחנות עבודה'}><X size={20} /></button>
        </header>

        <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-outline-variant bg-surface-1 px-3">
            <Search size={17} className="shrink-0 text-on-variant" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === 'en' ? 'Search workspaces' : 'חיפוש שולחן עבודה'} aria-label={lang === 'en' ? 'Search workspaces' : 'חיפוש שולחן עבודה'} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-on-variant/70" />
            {query && <button type="button" onClick={() => setQuery('')} className="rounded-full p-1 text-on-variant hover:bg-surface-2" aria-label={lang === 'en' ? 'Clear search' : 'נקה חיפוש'}><X size={14} /></button>}
          </div>
          <button type="button" onClick={addWorkspace} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"><Plus size={17} /><span className="hidden sm:inline">{lang === 'en' ? 'New workspace' : 'שולחן עבודה חדש'}</span></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {filteredWorkspaces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant px-4 py-10 text-center text-sm text-on-variant">{lang === 'en' ? 'No workspaces found' : 'לא נמצאו שולחנות עבודה'}</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredWorkspaces.map((workspace) => {
                const isActive = workspace.id === activeWorkspaceId;
                const previewTabs = isActive ? tabs : workspace.tabs;
                return (
                  <article key={workspace.id} className={`flex min-w-0 flex-col rounded-xl border bg-surface-1 p-3 transition-colors motion-reduce:transition-none ${isActive ? 'border-primary ring-1 ring-primary/30' : 'border-outline-variant hover:border-primary/50'}`}>
                    <button type="button" onClick={() => activateWorkspace(workspace.id)} aria-current={isActive ? 'true' : undefined} className="flex min-w-0 items-start gap-3 rounded-lg p-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary"><Folder size={23} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">{workspace.name}</span>
                          {isActive && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{lang === 'en' ? 'Active' : 'פעיל'}</span>}
                          {workspace.isPinned && <Pin size={13} className="shrink-0 text-primary" aria-label={lang === 'en' ? 'Pinned' : 'מקובע'} />}
                        </span>
                        <span className="mt-1 block text-xs text-on-variant">{lang === 'en' ? `${previewTabs.length} tabs` : `${previewTabs.length} כרטיסיות`}</span>
                      </span>
                    </button>

                    <div className="mt-3 min-h-12 rounded-lg bg-surface-2/70 px-3 py-2 text-xs text-on-variant">
                      {previewTabs.length > 0 ? previewTabs.slice(0, 3).map((tab) => (
                        <div key={tab.id} className="truncate leading-5">{tab.kind === 'search' ? (lang === 'en' ? 'Search' : 'חיפוש') + (tab.query ? `: ${tab.query}` : '') : tab.title}</div>
                      )) : <span>{lang === 'en' ? 'No open tabs' : 'אין כרטיסיות פתוחות'}</span>}
                      {previewTabs.length > 3 && <div className="pt-1">{lang === 'en' ? `+ ${previewTabs.length - 3} more` : `ועוד ${previewTabs.length - 3}`}</div>}
                    </div>

                    {editingId === workspace.id ? (
                      <div className="mt-3 flex items-center gap-1.5">
                        <input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(workspace.id); if (event.key === 'Escape') setEditingId(null); }} maxLength={60} aria-label={lang === 'en' ? 'Workspace name' : 'שם שולחן העבודה'} className="min-w-0 flex-1 rounded-lg border border-outline bg-surface px-2.5 py-2 text-sm outline-none focus:border-primary" />
                        <button type="button" onClick={() => commitRename(workspace.id)} className="rounded-lg p-2 text-primary hover:bg-surface-2" aria-label={lang === 'en' ? 'Save name' : 'שמור שם'}><Check size={17} /></button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded-lg p-2 text-on-variant hover:bg-surface-2" aria-label={lang === 'en' ? 'Cancel rename' : 'בטל שינוי שם'}><X size={17} /></button>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => startRename(workspace.id, workspace.name)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-on-variant hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Pencil size={14} />{lang === 'en' ? 'Rename' : 'שנה שם'}</button>
                        <button type="button" onClick={() => { togglePinWorkspace(workspace.id); toast(workspace.isPinned ? (lang === 'en' ? 'Workspace unpinned' : 'הקיבוע בוטל') : (lang === 'en' ? 'Workspace pinned' : 'שולחן העבודה קובע')); }} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${workspace.isPinned ? 'text-primary' : 'text-on-variant'}`}><Pin size={14} />{workspace.isPinned ? (lang === 'en' ? 'Unpin' : 'בטל קיבוע') : (lang === 'en' ? 'Pin' : 'קבע')}</button>
                        {isActive && workspace.isPinned && <button type="button" onClick={() => { saveWorkspaceSnapshot(); toast(lang === 'en' ? 'Workspace snapshot saved' : 'מצב שולחן העבודה נשמר'); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Save size={14} />{lang === 'en' ? 'Save now' : 'שמור מצב נוכחי'}</button>}
                        <button type="button" disabled={isActive || workspaces.length <= 1} onClick={() => setDeleteId(workspace.id)} title={isActive ? (lang === 'en' ? 'The active workspace cannot be deleted' : 'לא ניתן למחוק את שולחן העבודה הפעיל') : undefined} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 size={14} />{lang === 'en' ? 'Delete' : 'מחק'}</button>
                      </div>
                    )}

                    {deleteId === workspace.id && <div role="alert" className="mt-3 rounded-lg border border-error/30 bg-error/5 p-3">
                      <p className="text-xs leading-5">{lang === 'en' ? `Delete “${workspace.name}” and its saved tabs?` : `למחוק את “${workspace.name}” ואת הכרטיסיות השמורות בו?`}</p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => setDeleteId(null)} className="rounded-lg px-3 py-1.5 text-xs hover:bg-surface-2">{lang === 'en' ? 'Cancel' : 'ביטול'}</button>
                        <button type="button" onClick={() => removeWorkspace(workspace.id)} className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white">{lang === 'en' ? 'Delete' : 'מחק'}</button>
                      </div>
                    </div>}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-outline-variant px-4 py-3 md:px-6">
          <button type="button" onClick={onClose} className="rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{lang === 'en' ? 'Close' : 'סגירה'}</button>
        </footer>
      </section>
    </div>
  );
}
