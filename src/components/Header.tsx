import React from 'react';
import { TabItem, ReaderSettings } from '../types/otzaria';
import {
  BookOpen,
  Search,
  Bookmark,
  Plus,
  X,
  Sun,
  Moon,
  Compass,
  Maximize2,
  Minimize2,
  Library,
  Sparkles,
  RotateCcw,
  BarChart3
} from 'lucide-react';

interface HeaderProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  hasRestorableSession?: boolean;
  onRestoreSession?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  settings,
  onUpdateSettings,
  hasRestorableSession,
  onRestoreSession
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getTabIcon = (type: TabItem['type']) => {
    switch (type) {
      case 'library':
        return <Library className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      case 'find':
        return <Compass className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      case 'search':
        return <Search className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      case 'book':
        return <BookOpen className="w-3.5 h-3.5 text-amber-800 shrink-0" />;
      case 'tzurat-hadaf':
        return <BookOpen className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      case 'tools':
        return <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      case 'bookmarks':
        return <Bookmark className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      case 'admin':
        return <BarChart3 className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-amber-700 shrink-0" />;
    }
  };

  const isDark = settings.theme === 'dark';

  return (
    <header className="bg-[#2D1B0E] text-amber-50 border-b border-[#432815] shadow-xs flex flex-col select-none relative z-20">
      {/* Desktop App Top Title Bar & Tab Strip */}
      <div className="flex items-stretch justify-between h-10 px-2">
        {/* Right side: App Branding & Tabs */}
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          {/* Logo & App Name */}
          <div className="flex items-center gap-2 px-2 shrink-0">
            <img src="/etz_hadata.png" alt="מים חיים" className="w-6 h-6 rounded-full object-cover border border-amber-400/40 shadow-xs" />
            <span className="font-serif font-black text-sm text-[#F7E7CE] tracking-wider">
              מים חיים
            </span>
          </div>

          <div className="h-4 w-px bg-amber-900/60 mx-1 shrink-0" />

          {/* Reading Tab Strip */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none h-full pt-1">
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`group relative flex items-center gap-2 px-3 h-8 text-xs font-medium rounded-t-md cursor-pointer border-t border-x transition-all duration-150 select-none ${
                    isActive
                      ? isDark
                        ? 'bg-[#1C1917] text-stone-100 border-[#1C1917] shadow-xs font-semibold'
                        : 'bg-[#FAF8F5] text-stone-900 border-[#FAF8F5] shadow-xs font-semibold'
                      : 'bg-[#3E2716]/60 hover:bg-[#4E321E] text-amber-200/90 border-transparent hover:border-[#5A3B24]'
                  }`}
                  style={{ maxWidth: '170px' }}
                >
                  {getTabIcon(tab.type)}
                  <span className="truncate flex-1 text-right">{tab.title}</span>

                  {tabs.length > 1 && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className={`p-0.5 rounded hover:bg-stone-200/60 transition-colors ${
                        isActive
                          ? isDark
                            ? 'text-stone-400 hover:text-stone-100'
                            : 'text-stone-500 hover:text-stone-900'
                          : 'text-amber-400/60 opacity-0 group-hover:opacity-100 hover:text-amber-100'
                      }`}
                      title="סגור כרטיסייה"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* New Tab Button */}
            <button
              onClick={onNewTab}
              className="p-1 text-amber-300/80 hover:text-amber-100 hover:bg-[#4E321E] rounded transition-colors self-center ml-1 cursor-pointer"
              title="פתח כרטיסייה חדשה"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Quick Restore Session Button */}
            {hasRestorableSession && onRestoreSession && (
              <button
                onClick={onRestoreSession}
                className="p-1 text-amber-300/90 hover:text-amber-100 hover:bg-[#4E321E] rounded transition-colors self-center ml-1 cursor-pointer flex items-center gap-1 bg-[#3E2716]/40 px-2 py-0.5 border border-[#5A3B24]/40"
                title="שחזר ספרים שהיו פתוחים בביקור האחרון"
              >
                <RotateCcw className="w-3 h-3 text-amber-300" />
                <span className="text-[11px] font-medium hidden sm:inline">שחזר ביקור</span>
              </button>
            )}
          </div>
        </div>

        {/* Left side: Quick Theme & Fullscreen Controls */}
        <div className="flex items-center gap-1 shrink-0 pl-1">
          {/* Theme Quick Toggle (Day / Night Mode) */}
          <button
            onClick={() =>
              onUpdateSettings({
                theme: isDark ? 'light' : 'dark'
              })
            }
            className="p-1.5 rounded text-amber-200/90 hover:bg-[#4E321E] transition-colors cursor-pointer"
            title={isDark ? 'מעבר למצב יום' : 'מעבר למצב לילה'}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-300" />
            ) : (
              <Moon className="w-4 h-4 text-amber-300" />
            )}
          </button>

          <div className="h-4 w-px bg-amber-900/60 mx-1" />

          {/* Window Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded text-amber-200/80 hover:bg-[#4E321E] transition-colors cursor-pointer"
            title={isFullscreen ? 'צא ממסך מלא' : 'מסך מלא'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
