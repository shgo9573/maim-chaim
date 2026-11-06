import React, { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  BookOpen,
  TrendingUp,
  BarChart3,
  Calendar,
  Activity,
  RefreshCw,
  Award,
  Sparkles
} from 'lucide-react';
import { fetchAnalyticsStats } from '../services/analyticsService';
import { AnalyticsStatsResponse } from '../services/analyticsStore';
import { ReaderSettings } from '../types/otzaria';

interface AnalyticsStatsViewProps {
  settings?: ReaderSettings;
}

export const AnalyticsStatsView: React.FC<AnalyticsStatsViewProps> = ({ settings }) => {
  const [stats, setStats] = useState<AnalyticsStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const isDark = settings?.theme === 'dark';

  const loadData = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await fetchAnalyticsStats();
      if (data) setStats(data);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => loadData(), 30000); // refresh every 30s
    return () => clearInterval(timer);
  }, []);

  const formatHoursMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) return `${mins} דקות`;
    if (mins === 0) return `${hours.toLocaleString()} שעות`;
    return `${hours.toLocaleString()} שעות ו-${mins} דק'`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <RefreshCw className="w-8 h-8 text-amber-700 animate-spin mb-3" />
        <span className={`text-sm ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
          טוען נתוני לימוד וסטטיסטיקות בזמן אמת...
        </span>
      </div>
    );
  }

  const s = stats || {
    onlineNow: 1,
    dau: 1,
    mau: 1,
    totalUniqueUsers: 1,
    totalStudyMinutes: 0,
    topBooks: [],
    categoryBreakdown: [],
    hourlyDistribution: new Array(24).fill(0),
    lastUpdated: new Date().toISOString()
  };

  // Find max hourly count for scale
  const maxHourly = Math.max(...(s.hourlyDistribution || [1]), 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header and Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={`text-lg font-bold font-serif flex items-center gap-2 ${isDark ? 'text-amber-300' : 'text-amber-950'}`}>
            <BarChart3 className="w-5 h-5 text-amber-600" />
            <span>מדדי לימוד ומשתמשים באתר (Analytics)</span>
          </h3>
          <p className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
            מעקב מדויק אחר לומדים פעילים, שעות לימוד תורה וספרים מובילים
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
            isDark
              ? 'bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700'
              : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50 shadow-2xs'
          }`}
          title="רענן נתונים"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
          <span>רענן נתונים</span>
        </button>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Online Now */}
        <div className={`p-4 rounded-2xl border relative overflow-hidden transition-all ${
          isDark
            ? 'bg-stone-900/80 border-stone-800 text-stone-100'
            : 'bg-white border-stone-200 shadow-2xs text-stone-900'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">לומדים כעת באתר</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
            {s.onlineNow.toLocaleString()}
          </div>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 block">
            פעילים ב-2.5 הדקות האחרונות
          </span>
        </div>

        {/* Card 2: DAU */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isDark
            ? 'bg-stone-900/80 border-stone-800 text-stone-100'
            : 'bg-white border-stone-200 shadow-2xs text-stone-900'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">לומדים ייחודיים היום (DAU)</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-blue-600 dark:text-blue-400">
            {s.dau.toLocaleString()}
          </div>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 block">
            ספירת מכשירים ומשתמשים ייחודיים
          </span>
        </div>

        {/* Card 3: MAU */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isDark
            ? 'bg-stone-900/80 border-stone-800 text-stone-100'
            : 'bg-white border-stone-200 shadow-2xs text-stone-900'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">לומדים החודש (MAU)</span>
            <Calendar className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-purple-600 dark:text-purple-400">
            {s.mau.toLocaleString()}
          </div>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 block">
            {s.totalUniqueUsers.toLocaleString()} לומדים רשומים בכל הזמנים
          </span>
        </div>

        {/* Card 4: Total Study Time */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isDark
            ? 'bg-stone-900/80 border-stone-800 text-stone-100'
            : 'bg-white border-stone-200 shadow-2xs text-stone-900'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">זמן לימוד מצטבר באתר</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight text-amber-700 dark:text-amber-400">
            {formatHoursMinutes(s.totalStudyMinutes)}
          </div>
          <span className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 block">
            מדוד לפי פעילות ממשית באתר
          </span>
        </div>
      </div>

      {/* Top Books & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Books */}
        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-2xs'
        }`}>
          <h4 className={`text-sm font-bold flex items-center gap-2 mb-3 ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
            <Award className="w-4 h-4 text-amber-600" />
            <span>הספרים והמסכתות המובילים בלימוד</span>
          </h4>

          {s.topBooks.length === 0 ? (
            <div className={`text-xs p-6 text-center ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
              הנתונים יתעדכנו עם המשך הלימוד באתר
            </div>
          ) : (
            <div className="space-y-2">
              {s.topBooks.map((book, idx) => (
                <div
                  key={book.title}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                    isDark
                      ? 'bg-stone-900/80 border-stone-800 hover:border-amber-700/50'
                      : 'bg-stone-50 border-stone-200/80 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center font-mono font-bold text-[11px] ${
                      idx === 0
                        ? 'bg-amber-800 text-white'
                        : idx === 1
                        ? 'bg-amber-700/70 text-white'
                        : idx === 2
                        ? 'bg-amber-600/50 text-white'
                        : isDark
                        ? 'bg-stone-800 text-stone-400'
                        : 'bg-stone-200 text-stone-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <span className={`font-semibold block ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                        {book.title}
                      </span>
                      {book.category && (
                        <span className={`text-[10px] ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
                          {book.category}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-left font-mono">
                    <span className="font-bold text-amber-800 dark:text-amber-400">
                      {book.minutes > 0 ? `${book.minutes} דק'` : `${book.count} כניסות`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-2xs'
        }`}>
          <h4 className={`text-sm font-bold flex items-center gap-2 mb-3 ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
            <BookOpen className="w-4 h-4 text-amber-600" />
            <span>פילוח תחומי לימוד</span>
          </h4>

          {s.categoryBreakdown.length === 0 ? (
            <div className={`text-xs p-6 text-center ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
              הנתונים יתעדכנו עם המשך הלימוד באתר
            </div>
          ) : (
            <div className="space-y-3">
              {s.categoryBreakdown.map(cat => (
                <div key={cat.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={`font-medium ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                      {cat.name}
                    </span>
                    <span className="font-mono text-stone-500 text-[11px]">
                      {cat.percentage}% ({cat.count} דק')
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-800 transition-all duration-500"
                      style={{ width: `${Math.max(cat.percentage, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hourly Activity (Peak Hours) */}
      <div className={`p-4 rounded-2xl border ${
        isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-2xs'
      }`}>
        <h4 className={`text-sm font-bold flex items-center gap-2 mb-2 ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
          <TrendingUp className="w-4 h-4 text-amber-600" />
          <span>זמני שיא של לימוד (התפלגות פעילות לאורך 24 שעות ביממה)</span>
        </h4>
        <p className={`text-[11px] mb-4 ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
          מציג את השעות הפופולריות ביותר שבהן הלומדים פעילים באתר (שעון מקומי)
        </p>

        <div className="flex items-end gap-1.5 h-28 pt-4 pb-2 px-1">
          {s.hourlyDistribution.map((count, hour) => {
            const heightPercent = maxHourly > 0 ? Math.round((count / maxHourly) * 100) : 0;
            return (
              <div key={hour} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-stone-900 text-white text-[9px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-20 shadow-md">
                  {hour}:00 - {count} פעולות
                </div>

                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    count > 0
                      ? 'bg-amber-700/80 hover:bg-amber-600'
                      : isDark
                      ? 'bg-stone-800/40'
                      : 'bg-stone-200/50'
                  }`}
                  style={{ height: `${Math.max(heightPercent, 6)}%` }}
                />

                <span className="text-[9px] font-mono text-stone-400 mt-1 select-none">
                  {hour % 4 === 0 ? String(hour).padStart(2, '0') : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
