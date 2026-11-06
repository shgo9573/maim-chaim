import React from 'react';
import {
  Library,
  Compass,
  BookOpen,
  Search,
  Sparkles,
  Settings,
  LucideIcon
} from 'lucide-react';

export type MainNavScreen = 'library' | 'find' | 'reading' | 'search' | 'tools' | 'settings' | 'admin';

interface SidebarProps {
  activeScreen: MainNavScreen;
  onSelectScreen: (screen: MainNavScreen) => void;
  hasOpenBooks: boolean;
}

interface NavButtonProps {
  id: MainNavScreen;
  label: string;
  icon: LucideIcon;
  tooltip: string;
  isActive: boolean;
  badge?: boolean;
  iconHoverClass?: string;
  onClick: () => void;
}

/* אנימציות מותאמות אישית (shimmer + הילה - הבהוב Shimmer מכובה כרגע לבקשת המשתמש) */
const sidebarStyles = `
  @keyframes sidebar-shimmer {
    0%   { transform: translateX(120%) skewX(-20deg); opacity: 0; }
    20%  { opacity: 1; }
    100% { transform: translateX(-180%) skewX(-20deg); opacity: 0; }
  }
  @keyframes sidebar-glow-pulse {
    0%, 100% { box-shadow: 0 0 6px 1px rgba(251,191,36,0.45); }
    50%      { box-shadow: 0 0 14px 3px rgba(251,191,36,0.85); }
  }
  .nav-shimmer::after {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    width: 45%;
    background: linear-gradient(90deg, transparent, rgba(255,245,230,0.35), transparent);
    transform: translateX(120%) skewX(-20deg);
    opacity: 0;
    pointer-events: none;
    display: none; /* מכובה כרגע - הבהוב Shimmer ל-0 */
  }
  .nav-shimmer:hover::after {
    /* animation: sidebar-shimmer 0.9s ease-out forwards; */ /* מכובה כרגע לבקשת המשתמש */
  }
  .nav-active-bar {
    animation: sidebar-glow-pulse 2.4s ease-in-out infinite;
  }
`;

const NavButton: React.FC<NavButtonProps> = ({
  label,
  icon: Icon,
  tooltip,
  isActive,
  badge,
  iconHoverClass = 'group-hover:scale-125 group-hover:-rotate-6',
  onClick
}) => {
  return (
    <button
      onClick={onClick}
      aria-label={tooltip}
      className={`
        nav-shimmer
        relative w-full py-2.5 px-1 rounded-xl overflow-hidden
        flex flex-col items-center justify-center gap-1
        group select-none
        transition-all duration-300 ease-out
        active:scale-95 active:duration-75
        ${
          isActive
            ? `bg-gradient-to-b from-amber-600 to-amber-800 text-white font-bold
               shadow-[0_4px_18px_-4px_rgba(251,191,36,0.6)]
               hover:shadow-[0_8px_28px_-4px_rgba(251,191,36,0.85)]
               hover:brightness-125 hover:-translate-x-1`
            : `text-amber-200/80
               hover:bg-gradient-to-b hover:from-[#5C341A] hover:to-[#4A2A15]
               hover:text-white hover:brightness-125
               hover:-translate-x-1.5 hover:scale-105
               hover:shadow-[0_10px_30px_-6px_rgba(251,191,36,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]`
        }
      `}
    >
      {/* הילה זוהרת מאחורי האייקון - בהירה יותר בריחוף */}
      <span
        className="
          absolute w-10 h-10 rounded-full bg-amber-300/35 blur-xl
          scale-0 opacity-0
          group-hover:scale-150 group-hover:opacity-100
          transition-all duration-500 ease-out
          pointer-events-none
        "
        style={{ top: '4px' }}
      />

      {/* אייקון + באדג' */}
      <div className="relative z-10">
        <Icon
          className={`
            w-5 h-5
            transition-all duration-300 ease-out
            ${iconHoverClass}
            group-hover:drop-shadow-[0_0_10px_rgba(255,225,160,0.95)]
            ${isActive ? 'text-white' : 'text-amber-300/90 group-hover:text-white'}
          `}
        />
        {badge && !isActive && (
          <span className="absolute -top-1 -right-1 flex w-2 h-2">
            <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-400" />
          </span>
        )}
      </div>

      {/* תווית - מוארת יותר בריחוף */}
      <span
        className="
          relative z-10 text-[11px] font-sans font-medium tracking-tight
          transition-all duration-300
          group-hover:tracking-wide group-hover:-translate-y-px group-hover:text-white group-hover:font-semibold
        "
      >
        {label}
      </span>

      {/* פס אינדיקציה פעיל */}
      {isActive && (
        <span className="nav-active-bar absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
      )}

      {/* Tooltip מרחף שמחליק משמאל */}
      <span
        className="
          absolute right-full top-1/2 -translate-y-1/2 mr-3
          whitespace-nowrap px-3 py-1.5 rounded-lg
          bg-[#2E1A0E] text-amber-100 text-xs font-medium
          border border-amber-700/50
          shadow-[0_6px_20px_-4px_rgba(0,0,0,0.6),0_0_12px_-2px_rgba(251,191,36,0.35)]
          opacity-0 translate-x-3 scale-95
          group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100
          transition-all duration-300 ease-out delay-100
          pointer-events-none z-50
          after:content-[''] after:absolute after:left-full after:top-1/2 after:-translate-y-1/2
          after:border-[6px] after:border-transparent after:border-l-[#2E1A0E]
        "
      >
        {tooltip}
      </span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  onSelectScreen,
  hasOpenBooks
}) => {
  const topNavItems = [
    {
      id: 'library' as MainNavScreen,
      label: 'ספרייה',
      icon: Library,
      tooltip: 'ספרייה - עיון בקטלוג הספרים'
    },
    {
      id: 'find' as MainNavScreen,
      label: 'איתור',
      icon: Compass,
      tooltip: 'איתור - איתור מהיר של מקור לפי ספר, פרק ופסוק',
      iconHoverClass: 'group-hover:scale-125 group-hover:rotate-45'
    },
    {
      id: 'reading' as MainNavScreen,
      label: 'עיון',
      icon: BookOpen,
      tooltip: 'עיון - מעבר לספרים הפתוחים',
      badge: hasOpenBooks
    },
    {
      id: 'search' as MainNavScreen,
      label: 'חיפוש',
      icon: Search,
      tooltip: 'חיפוש - מנוע חיפוש במאגר',
      iconHoverClass: 'group-hover:scale-125 group-hover:rotate-12'
    },
    {
      id: 'tools' as MainNavScreen,
      label: 'כלים',
      icon: Sparkles,
      tooltip: 'כלים - דף יומי, גימטריה, תאריכון, סימניות והערות',
      iconHoverClass: 'group-hover:scale-125 group-hover:rotate-12'
    }
  ];

  return (
    <aside
      className="
        w-16 bg-gradient-to-b from-[#24150B] via-[#22130A] to-[#1C0F07]
        text-amber-100 border-l border-[#3D2312]
        flex flex-col items-center py-2.5 justify-between
        shrink-0 select-none z-10
        shadow-[inset_-1px_0_0_rgba(251,191,36,0.06),-4px_0_18px_-6px_rgba(0,0,0,0.5)]
      "
    >
      <style>{sidebarStyles}</style>

      {/* ניווט עליון */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        {topNavItems.map(item => (
          <NavButton
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            tooltip={item.tooltip}
            badge={item.badge}
            iconHoverClass={item.iconHoverClass}
            isActive={activeScreen === item.id}
            onClick={() => onSelectScreen(item.id)}
          />
        ))}
      </div>

      {/* הגדרות למטה */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5 pt-2 border-t border-[#3D2312]/80">
        {/* קרדיט / ייחוס מעל ההגדרות */}
        <div
          className="text-center px-0.5 py-1 text-[9.5px] leading-tight text-amber-300/70 hover:text-amber-200 transition-colors font-medium select-none cursor-default"
          title="מבוסס על פרויקט אוצריא"
        >
          מבוסס על<br />אוצריא
        </div>

        <NavButton
          id="settings"
          label="הגדרות"
          icon={Settings}
          tooltip="הגדרות תצוגה, גופנים וערכות נושא"
          isActive={activeScreen === 'settings'}
          iconHoverClass="group-hover:scale-125 group-hover:rotate-90"
          onClick={() => onSelectScreen('settings')}
        />
      </div>
    </aside>
  );
};
