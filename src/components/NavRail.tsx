import { Library, FileSearch, BookOpen, Search, LayoutGrid, Settings, Info, Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../store';
import { t } from '../i18n';

interface Item {
  key: string;
  label: string;
  icon: ReactNode;
  tip: string;
  selected: boolean;
  onClick: () => void;
}

export default function NavRail() {
  const { screen, setScreen, tabs, activeTabId, openSearch, setDialog, settings, updateSettings } = useApp();
  const lang = settings.interfaceLanguage || 'he';
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const searchActive = screen === 'reading' && activeTab?.kind === 'search';

  const top: Item[] = [
    { key: 'library', label: 'ספרייה', icon: <Library size={24} />, tip: 'CTRL+L', selected: screen === 'library', onClick: () => setScreen('library') },
    { key: 'find', label: 'איתור', icon: <FileSearch size={24} />, tip: 'CTRL+O', selected: screen === 'find', onClick: () => setScreen('find') },
    { key: 'reading', label: 'עיון', icon: <BookOpen size={24} />, tip: 'CTRL+R', selected: screen === 'reading' && !searchActive, onClick: () => setScreen('reading') },
    { key: 'search', label: 'חיפוש', icon: <Search size={24} />, tip: 'CTRL+Q', selected: searchActive, onClick: () => openSearch() },
    { key: 'more', label: 'כלים', icon: <LayoutGrid size={24} />, tip: 'CTRL+M', selected: screen === 'more', onClick: () => setScreen('more') },
  ];
  const bottom: Item[] = [
    { key: 'settings', label: 'הגדרות', icon: <Settings size={24} />, tip: 'CTRL+,', selected: screen === 'settings', onClick: () => setScreen('settings') },
    { key: 'about', label: 'אודות', icon: <Info size={24} />, tip: '', selected: false, onClick: () => setDialog('about') },
  ];

  const render = (it: Item) => (
    <button
      key={it.key}
      onClick={it.onClick}
      title={it.tip}
      className="group flex w-full flex-col items-center gap-1 py-1.5 md:w-20"
    >
      <span
        className={`flex h-8 w-16 items-center justify-center rounded-2xl transition-colors ${
          it.selected ? 'bg-sec-container text-on-sec-container' : 'text-on-variant group-hover:bg-surface-3'
        }`}
      >
        {it.icon}
      </span>
      <span className={`text-xs ${it.selected ? 'font-medium text-on-sec-container' : 'text-on-variant'}`}>{t(it.label, lang)}</span>
    </button>
  );

  return (
    <nav className="flex shrink-0 flex-row items-center justify-between overflow-x-auto border-t border-outline-variant bg-surface px-1 md:w-20 md:flex-col md:justify-start md:overflow-y-auto md:border-t-0 md:border-l md:px-0 md:py-3">
      <button
        onClick={() => setScreen('library')}
        className="hidden w-20 flex-col items-center gap-1 pb-3 pt-1 text-center text-[15px] font-bold leading-tight text-primary md:flex"
        title="מיים חיים"
        aria-label={lang === 'en' ? 'Mayim Chaim home' : 'דף הבית מיים חיים'}
      >
        <img src="./icon.svg?v=20261012-goldbook" alt="" className="h-10 w-10 rounded-xl object-contain" />
        <span>{lang === 'en' ? 'Mayim Chaim' : 'מיים חיים'}</span>
      </button>
      <div className="flex flex-row md:flex-col md:items-center">{top.map(render)}</div>
      <div className="hidden md:block md:flex-1" />
      <button
        onClick={() => updateSettings({ interfaceLanguage: lang === 'he' ? 'en' : 'he' })}
        className="group flex w-full flex-col items-center gap-1 py-1 text-on-variant hover:text-primary md:w-20"
        title={lang === 'he' ? 'Switch interface to English' : 'החלף ממשק לעברית'}
      >
        <span className="flex h-8 w-16 items-center justify-center gap-1 rounded-2xl group-hover:bg-surface-3"><Languages size={20} /><span className="text-xs font-semibold">{lang === 'he' ? 'EN' : 'עב'}</span></span>
        <span className="text-xs">{lang === 'he' ? 'English' : 'עברית'}</span>
      </button>
      <a
        href="https://otzaria.org/"
        target="_blank"
        rel="noreferrer"
        title="האתר מבוסס על תוכנת אוצריא"
        className="hidden w-20 px-1 pb-1 text-center text-[10px] leading-tight text-on-variant hover:text-primary hover:underline md:block"
      >
        {t('מבוסס על', lang)}
        <br />
        אוצריא
      </a>
      <div className="flex flex-row md:flex-col md:items-center">{bottom.map(render)}</div>
    </nav>
  );
}
