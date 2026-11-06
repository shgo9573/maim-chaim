import React, { useState, useRef } from 'react';
import { ReaderSettings, DEFAULT_READER_SETTINGS, BookItem } from '../types/otzaria';
import { CustomStudyModal } from './CustomStudyModal';
import { OTZARIA_FONTS, getFontFamilyCss } from '../utils/fontHelper';
import {
  Settings,
  Type,
  Eye,
  X,
  AlignJustify,
  Copy,
  LayoutGrid,
  Calendar,
  Keyboard,
  Download,
  Upload,
  RotateCcw,
  Palette,
  Bold,
  BookOpen,
  Plus,
  Sliders,
  Check,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { downloadBackupJson, restoreBackupFromJson, resetUserSettingsOnCloud } from '../services/userService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onResetSettings: () => void;
  catalogBooks?: BookItem[];
}

type SettingsTab =
  | 'text_font'
  | 'text_policy'
  | 'copy'
  | 'design'
  | 'library'
  | 'tools'
  | 'shortcuts'
  | 'system';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
  catalogBooks = []
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('text_font');
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [isCustomStudyModalOpen, setIsCustomStudyModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isDark = settings.theme === 'dark';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: 'merge' | 'replace') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const text = event.target?.result as string;
        const backupData = JSON.parse(text);
        const res = await restoreBackupFromJson(backupData, mode);
        if (res.settings) {
          onUpdateSettings(res.settings);
        }
        setRestoreMessage('הנתונים שוחזרו בהצלחה מהקובץ!');
        setTimeout(() => setRestoreMessage(null), 4000);
      } catch (err: any) {
        alert('שגיאה בקריאת קובץ הגיבוי: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'text_font', label: 'גופן וטקסט', icon: <Type className="w-4 h-4" /> },
    { id: 'text_policy', label: 'ניקוד ושמות', icon: <Eye className="w-4 h-4" /> },
    { id: 'copy', label: 'העתקה', icon: <Copy className="w-4 h-4" /> },
    { id: 'design', label: 'מראה ועיצוב', icon: <Palette className="w-4 h-4" /> },
    { id: 'library', label: 'ספרייה ואינדקס', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'tools', label: 'זמנים ולימוד', icon: <Calendar className="w-4 h-4" /> },
    { id: 'shortcuts', label: 'קיצורי מקשים', icon: <Keyboard className="w-4 h-4" /> },
    { id: 'system', label: 'מערכת וגיבוי', icon: <Settings className="w-4 h-4" /> }
  ];

  // Colors available for Theme Seed Color
  const themeColors = [
    { id: '#92400E', name: 'ענבר / זהב תורני (ברירת מחדל)', bg: 'bg-amber-800' },
    { id: '#1E3A8A', name: 'כחול מלכותי', bg: 'bg-blue-900' },
    { id: '#065F46', name: 'ירוק יער', bg: 'bg-emerald-800' },
    { id: '#831843', name: 'בורדו עתיק', bg: 'bg-rose-900' },
    { id: '#374151', name: 'אפור צפחה', bg: 'bg-stone-700' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className={`w-full max-w-3xl rounded-3xl border shadow-2xl flex flex-col h-[88vh] max-h-[760px] overflow-hidden ${
        isDark ? 'bg-[#211711] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
      }`}>
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-stone-50/80 border-stone-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-800 text-amber-100 rounded-2xl shadow-xs">
              <Settings className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className={`text-lg font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>
                הגדרות אוצריא
              </h3>
              <p className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                התאמת גופנים, תצוגת ספר ומפרשים, ניקוד, מראה, זמנים ולימוד
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              isDark ? 'text-stone-400 hover:text-stone-200 hover:bg-stone-800' : 'text-stone-400 hover:text-stone-800 hover:bg-stone-200/60'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div className={`flex items-center gap-1 px-4 py-2 border-b overflow-x-auto text-xs font-sans select-none scrollbar-none ${
          isDark ? 'bg-[#18110D] border-stone-800' : 'bg-stone-100/70 border-stone-200'
        }`}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-amber-800 text-white font-bold shadow-xs'
                  : isDark
                  ? 'text-stone-400 hover:bg-stone-800 hover:text-stone-200 font-medium'
                  : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 font-medium'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Modal Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm font-sans">
          {/* TAB 1: TEXT & FONTS (Aligned with Otzaria text_settings_tab.dart) */}
          {activeTab === 'text_font' && (
            <div className="space-y-6">
              {/* Live Preview Box */}
              <div className={`p-4 rounded-2xl border ${
                isDark ? 'bg-stone-950/60 border-stone-800' : 'bg-amber-50/50 border-amber-200/70'
              }`}>
                <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-2 flex items-center justify-between">
                  <span>תצוגה מקדימה חיה של הטקסט והמפרשים:</span>
                  <span className="text-[11px] font-normal text-stone-500">מתעדכן בזמן אמת</span>
                </div>
                <div
                  className="p-4 rounded-xl border bg-white dark:bg-[#18110D] border-stone-200 dark:border-stone-800 transition-all space-y-3"
                  style={{
                    lineHeight: settings.lineHeight || 1.8,
                    maxWidth: settings.textMaxWidth === '100%' ? '100%' : (settings.textMaxWidth || '90%'),
                    margin: '0 auto'
                  }}
                >
                  <p
                    style={{
                      fontFamily: getFontFamilyCss(settings.fontFamily, false),
                      fontSize: `${settings.fontSize}px`,
                      fontWeight: settings.fontBold ? 700 : 400
                    }}
                    className="text-stone-900 dark:text-stone-100 transition-all"
                  >
                    בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃
                  </p>
                  <div
                    style={{
                      fontFamily: getFontFamilyCss(settings.commentaryFontFamily, true),
                      fontSize: `${settings.commentaryFontSize || 18}px`,
                      fontWeight: settings.commentaryFontBold ? 700 : 400
                    }}
                    className="text-amber-950 dark:text-amber-200 border-r-2 border-amber-800 pr-3 transition-all"
                  >
                    <span className="font-bold">רש״י:</span> בראשית — אמר רבי יצחק לא היה צריך להתחיל את התורה אלא מ״החודש הזה לכם״, שהיא מצוה ראשונה שנצטוו בה ישראל...
                  </div>
                </div>
              </div>

              {/* Row 1: Book Font Family + Bold Button */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className={`font-semibold flex items-center gap-1.5 ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                      <Type className="w-4 h-4 text-amber-600" />
                      <span>גופן טקסט הספר (ספר ראשי):</span>
                    </label>
                    <button
                      onClick={() => onUpdateSettings({ fontBold: !settings.fontBold })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                        settings.fontBold
                          ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                      }`}
                      title={settings.fontBold ? 'הצג במשקל רגיל' : 'הדגש גופן (בולד)'}
                    >
                      <Bold className="w-3.5 h-3.5" />
                      <span>מודגש (Bold)</span>
                    </button>
                  </div>
                  <select
                    value={settings.fontFamily}
                    onChange={e => onUpdateSettings({ fontFamily: e.target.value })}
                    className={`w-full rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                      isDark
                        ? 'bg-stone-900 border border-stone-700 text-stone-100'
                        : 'bg-stone-50 border border-stone-300 text-stone-900'
                    }`}
                  >
                    {OTZARIA_FONTS.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.nameHe} {f.id === 'FrankRuhlCLM' ? '★ ברירת מחדל בתוכנה' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Book Font Size Slider */}
                <div className="flex flex-col gap-2">
                  <div className={`flex justify-between font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    <span>גודל גופן הספר:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })}
                        className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-xs font-bold hover:bg-amber-800 hover:text-white"
                      >
                        -
                      </button>
                      <span className="text-amber-500 font-bold font-mono min-w-8 text-center">{settings.fontSize}px</span>
                      <button
                        onClick={() => onUpdateSettings({ fontSize: Math.min(60, settings.fontSize + 1) })}
                        className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-xs font-bold hover:bg-amber-800 hover:text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={14}
                    max={60}
                    step={1}
                    value={settings.fontSize}
                    onChange={e => onUpdateSettings({ fontSize: parseInt(e.target.value) })}
                    className="w-full accent-amber-800 cursor-pointer mt-2"
                  />
                  <div className="flex justify-between text-[11px] text-stone-400">
                    <span>14px קטן</span>
                    <span>22px ברירת מחדל</span>
                    <span>60px ענק</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Commentary Font Family + Bold Button */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className={`font-semibold flex items-center gap-1.5 ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                      <Type className="w-4 h-4 text-amber-600" />
                      <span>גופן המפרשים (פרשנים):</span>
                    </label>
                    <button
                      onClick={() => onUpdateSettings({ commentaryFontBold: !settings.commentaryFontBold })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                        settings.commentaryFontBold
                          ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                      }`}
                      title={settings.commentaryFontBold ? 'הצג במשקל רגיל' : 'הדגש גופן מפרשים (בולד)'}
                    >
                      <Bold className="w-3.5 h-3.5" />
                      <span>מודגש (Bold)</span>
                    </button>
                  </div>
                  <select
                    value={settings.commentaryFontFamily || 'NotoRashiHebrew'}
                    onChange={e => onUpdateSettings({ commentaryFontFamily: e.target.value })}
                    className={`w-full rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                      isDark
                        ? 'bg-stone-900 border border-stone-700 text-stone-100'
                        : 'bg-stone-50 border border-stone-300 text-stone-900'
                    }`}
                  >
                    {OTZARIA_FONTS.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.nameHe} {f.id === 'NotoRashiHebrew' ? '★ ברירת מחדל מפרשים בתוכנה' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Commentary Font Size Slider */}
                <div className="flex flex-col gap-2">
                  <div className={`flex justify-between font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    <span>גודל גופן מפרשים:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateSettings({ commentaryFontSize: Math.max(10, (settings.commentaryFontSize || 18) - 1) })}
                        className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-xs font-bold hover:bg-amber-800 hover:text-white"
                      >
                        -
                      </button>
                      <span className="text-amber-500 font-bold font-mono min-w-8 text-center">{settings.commentaryFontSize || 18}px</span>
                      <button
                        onClick={() => onUpdateSettings({ commentaryFontSize: Math.min(40, (settings.commentaryFontSize || 18) + 1) })}
                        className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-xs font-bold hover:bg-amber-800 hover:text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={40}
                    step={1}
                    value={settings.commentaryFontSize || 18}
                    onChange={e => onUpdateSettings({ commentaryFontSize: parseInt(e.target.value) })}
                    className="w-full accent-amber-800 cursor-pointer mt-2"
                  />
                  <div className="flex justify-between text-[11px] text-stone-400">
                    <span>10px עדין</span>
                    <span>18px ברירת מחדל</span>
                    <span>40px גדול</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Line Height */}
              <div className="flex flex-col gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div className={`flex justify-between font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  <span className="flex items-center gap-1.5">
                    <AlignJustify className="w-4 h-4 text-amber-600" />
                    <span>מרווח בין שורות (Line Height):</span>
                  </span>
                  <span className="text-amber-500 font-bold font-mono">{settings.lineHeight || 1.8}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1.0, 1.2, 1.5, 1.8, 2.0].map(val => (
                    <button
                      key={val}
                      onClick={() => onUpdateSettings({ lineHeight: val })}
                      className={`py-2 text-xs rounded-xl border font-mono transition-colors cursor-pointer ${
                        (settings.lineHeight || 1.8) === val
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {val.toFixed(1)} {val === 1.8 ? '★' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: Text Max Width */}
              <div className="flex flex-col gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div className={`flex justify-between font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  <span>רוחב הטקסט (מניעת שורות ארוכות ומיקוד בקריאה):</span>
                  <span className="text-amber-500 font-bold">{settings.textMaxWidth || '90%'}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {['70%', '80%', '85%', '90%', '100%'].map(w => (
                    <button
                      key={w}
                      onClick={() => onUpdateSettings({ textMaxWidth: w as any })}
                      className={`py-2 text-xs rounded-xl border font-medium transition-colors cursor-pointer ${
                        (settings.textMaxWidth || '90%') === w
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {w === '100%' ? 'מלא (100%)' : w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 5: Continuous Reading Mode */}
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    מצב קריאה רציפה בתנ"ך ובתלמוד
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    הצגת השורות ברצף עד הכותרת הבאה (מונע שבירת שורות מלאכותית)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.continuousReadingMode)}
                  onChange={e => onUpdateSettings({ continuousReadingMode: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>

              {/* Row 6: Per-Book Settings */}
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    שמירת התאמות לכל ספר בנפרד (Per-Book Settings)
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    גודל הגופן, המפרשים והניקוד יישמרו באופן ייחודי לכל ספר שנפתח
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.perBookSettingsEnabled !== false}
                  onChange={e => onUpdateSettings({ perBookSettingsEnabled: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>
            </div>
          )}

          {/* TAB 2: TEXT POLICY (Nikud, Teamim, Holy Names) */}
          {activeTab === 'text_policy' && (
            <div className="space-y-5">
              {/* Nikud Policy */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  מדיניות הצגת ניקוד:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'הצג תמיד (ניקוד מלא)' },
                    { id: 'tanakh_only', label: 'הצג בתנ"ך בלבד' },
                    { id: 'none', label: 'אל תציג (הסתר ניקוד)' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ nikudPolicy: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center font-medium transition-colors cursor-pointer ${
                        (settings.nikudPolicy || 'all') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Holy Name Replacement */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  הצגת שם הקודש (שם הוי"ה משיקולי קדושה):
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "ה'", label: "ה׳ (ברירת מחדל)" },
                    { id: "יי", label: "יי" },
                    { id: "ד'", label: "ד׳" },
                    { id: "יהוה", label: "יהוה (ללא שינוי)" }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ holyNameReplacement: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center font-serif font-bold transition-colors cursor-pointer ${
                        (settings.holyNameReplacement || "ה'") === opt.id
                          ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Teamim & Punctuation Toggles */}
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
                }`}>
                  <div className="flex flex-col">
                    <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>הצגת טעמי המקרא</span>
                    <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>הצג טעמים בפסוקי תנ"ך</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showTeamim !== false}
                    onChange={e => onUpdateSettings({ showTeamim: e.target.checked })}
                    className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                  />
                </div>

                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
                }`}>
                  <div className="flex flex-col">
                    <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>הצגת סימני פיסוק</span>
                    <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>הצג / הסתר פסיקים, נקודות וסוגריים</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showPunctuation !== false}
                    onChange={e => onUpdateSettings({ showPunctuation: e.target.checked })}
                    className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                  />
                </div>

                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
                }`}>
                  <div className="flex flex-col">
                    <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>ציוני מפרשים בגוף הטקסט</span>
                    <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                      הצגת אותיות קטנות וקישורים המפנים לפרשנים לצד המילים
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showCommentaryMarkers !== false}
                    onChange={e => onUpdateSettings({ showCommentaryMarkers: e.target.checked })}
                    className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                  />
                </div>

                {/* Commentary Layout Mode */}
                <div className="flex flex-col gap-2 pt-2">
                  <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    אופן תצוגת מפרשים וקישורים:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'auto', label: 'אוטומטי (מחשב: פאנל צד, מובייל: מתחת לשורה)' },
                      { id: 'side_panel', label: 'פאנל צדדי מפוצל (Split View)' },
                      { id: 'inline', label: 'משולב מתחת לשורה (Inline)' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => onUpdateSettings({ commentaryViewMode: opt.id as any })}
                        className={`p-3 text-xs rounded-xl border text-center font-medium transition-colors cursor-pointer ${
                          (settings.commentaryViewMode || 'auto') === opt.id
                            ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                            : isDark
                            ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                            : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
                }`}>
                  <div className="flex flex-col">
                    <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                      פתיחת פאנל המפרשים בפתיחת ספר
                    </span>
                    <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                      פאנל המפרשים ייפתח אוטומטית כשיש מפרשים נבחרים
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.defaultCommentaryOpen)}
                    onChange={e => onUpdateSettings({ defaultCommentaryOpen: e.target.checked })}
                    className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COPY SETTINGS (Aligned with text_settings_tab.dart) */}
          {activeTab === 'copy' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  העתקת הכותרת והמקור:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'none', label: 'ללא', desc: 'הטקסט יועתק ללא כותרות' },
                    { id: 'book_name', label: 'שם הספר', desc: 'הטקסט יועתק עם שם הספר בלבד' },
                    { id: 'book_and_path', label: 'שם וכותרת', desc: 'הטקסט יועתק עם שם הספר ונתיב המקור' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ copyWithHeaders: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center transition-colors cursor-pointer ${
                        (settings.copyWithHeaders || 'book_and_path') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[11px] opacity-80 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {settings.copyWithHeaders !== 'none' && (
                <div className="flex flex-col gap-2">
                  <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    עיצוב כותרות בהעתקה:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: 'same_line_after_brackets', label: 'אותה שורה אחרי (עם סוגריים)' },
                      { id: 'same_line_after_no_brackets', label: 'אותה שורה אחרי (בלי סוגריים)' },
                      { id: 'same_line_before_brackets', label: 'אותה שורה לפני (עם סוגריים)' },
                      { id: 'same_line_before_no_brackets', label: 'אותה שורה לפני (בלי סוגריים)' },
                      { id: 'separate_line_after', label: 'פסקה נפרדת אחרי' },
                      { id: 'separate_line_before', label: 'פסקה נפרדת לפני' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => onUpdateSettings({ copyHeaderFormat: opt.id as any })}
                        className={`p-2.5 text-xs rounded-xl border text-right font-medium transition-colors cursor-pointer flex items-center justify-between ${
                          (settings.copyHeaderFormat || 'same_line_after_brackets') === opt.id
                            ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                            : isDark
                            ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                            : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {(settings.copyHeaderFormat || 'same_line_after_brackets') === opt.id && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DESIGN & THEME (Aligned with design_settings_tab.dart) */}
          {activeTab === 'design' && (
            <div className="space-y-5">
              {/* Theme Mode */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  ערכת נושא:
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'sepia', label: 'חם (ספיה - קלאסי)' },
                    { id: 'light', label: 'בהיר' },
                    { id: 'dark', label: 'כהה' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ theme: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                        settings.theme === opt.id
                          ? 'bg-amber-800 text-white border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seed Color Picker */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  צבע בסיס ראשי של הממשק:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {themeColors.map(c => (
                    <button
                      key={c.id}
                      onClick={() => onUpdateSettings({ seedColor: c.id })}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all cursor-pointer ${
                        (settings.seedColor || '#92400E') === c.id
                          ? 'ring-2 ring-amber-600 border-amber-600 font-bold shadow-xs'
                          : isDark
                          ? 'border-stone-800 bg-stone-900'
                          : 'border-stone-200 bg-white'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${c.bg} shrink-0 shadow-2xs`} />
                      <span className="truncate">{c.name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Compact Menu Mode */}
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    צפיפות ממשק (Compact Mode)
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    הצגת יותר תוכן על ידי הקטנת המרווחים בתפריטים וברשימות
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.compactMenuMode)}
                  onChange={e => onUpdateSettings({ compactMenuMode: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>

              {/* Reading Tabs Placement */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  מיקום כרטיסיות העיון:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'top', label: 'למעלה (ברצועת הכותרת)', desc: 'כרטיסיות אופקיות בשורת הכותרת' },
                    { id: 'side', label: 'בצד (בעמודה אנכית)', desc: 'כרטיסיות ברשימה אנכית לצד המסך' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ readingTabsPlacement: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center transition-colors cursor-pointer ${
                        (settings.readingTabsPlacement || 'top') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[11px] opacity-80 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Talmud Bavli Opening Format (Text vs PDF) */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  פורמט פתיחת תלמוד בבלי:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'text', label: 'טקסט (קריאה וחיפוש דיגיטלי)', desc: 'פתיחת מסכתות בטקסט מעוצב עם מפרשים' },
                    { id: 'pdf', label: 'PDF צורת הדף (דפוס וילנא)', desc: 'פתיחה ישירה של צורת הדף המסורתית' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ talmudBavliOpenFormat: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center transition-colors cursor-pointer ${
                        (settings.talmudBavliOpenFormat || 'text') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[11px] opacity-80 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sidebar Mode */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  חלונית ניווט בין כותרות (תוכן עניינים):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pinned', label: 'הצגה קבועה' },
                    { id: 'openOnBook', label: 'אוטומטי (בפתיחה)' },
                    { id: 'closed', label: 'הסתרה' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ sidebarMode: opt.id as any })}
                      className={`p-2.5 text-xs rounded-xl border text-center font-medium transition-colors cursor-pointer ${
                        (settings.sidebarMode || 'pinned') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LIBRARY & INDEX (Aligned with library_settings_tab.dart) */}
          {activeTab === 'library' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  אופן תצוגת רשימת הספרים:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'grid', label: 'כרטיסים (Grid)' },
                    { id: 'list', label: 'רשימה מסודרת (List)' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ libraryViewMode: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center font-medium transition-colors cursor-pointer ${
                        (settings.libraryViewMode || 'grid') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    פאנל תצוגה מקדימה לספר
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    הצגת פרטי ספר מהירים ותוכן עניינים לפני פתיחה מלאה
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showBookPreview !== false}
                  onChange={e => onUpdateSettings({ showBookPreview: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    הצגת ספרי היברובוקס (HebrewBooks)
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    שילוב ספרי מאגר HebrewBooks בתוצאות איתור הספרים
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showHebrewBooks !== false}
                  onChange={e => onUpdateSettings({ showHebrewBooks: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    הצגת ספרי אוצר החכמה
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    הצגת קישורים לספרי אוצר החכמה בחיפוש ואיתור
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.showOtzarHachochma)}
                  onChange={e => onUpdateSettings({ showOtzarHachochma: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    מיזוג ספרים אישיים לעץ הספרייה
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    שילוב ספרי המשתמש בתוך הקטגוריות הראשיות לפי נושא
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.mergeUserBooksIntoLibrary)}
                  onChange={e => onUpdateSettings({ mergeUserBooksIntoLibrary: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>
            </div>
          )}

          {/* TAB 6: TOOLS, ZMANIM & STUDY (Aligned with calendar_settings_panel.dart) */}
          {activeTab === 'tools' && (
            <div className="space-y-5">
              {/* Location */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  מיקום לחישוב זמני היום:
                </label>
                <select
                  value={settings.calendarLocation || 'ירושלים'}
                  onChange={e => onUpdateSettings({ calendarLocation: e.target.value })}
                  className={`w-full rounded-xl p-3 font-sans text-sm focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                    isDark
                      ? 'bg-stone-900 border border-stone-700 text-stone-100'
                      : 'bg-stone-50 border border-stone-300 text-stone-900'
                  }`}
                >
                  <option value="ירושלים">ירושלים</option>
                  <option value="בני ברק">בני ברק / גוש דן</option>
                  <option value="צפת">צפת והגליל</option>
                  <option value="חיפה">חיפה והקריות</option>
                  <option value="באר שבע">באר שבע והדרום</option>
                  <option value="ניו יורק">ניו יורק (New York)</option>
                  <option value="לונדון">לונדון (London)</option>
                </select>
              </div>

              {/* Zmanim calculation method */}
              <div className="flex flex-col gap-2">
                <label className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                  מנהגי זמנים ושיטות חישוב:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gra', label: 'שיטת הגר"א (זריחה עד שקיעה)' },
                    { id: 'mga', label: 'שיטת מגן אברהם (עלות עד צאת)' },
                    { id: 'baal_hatanya', label: 'שיטת בעל התניא' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ zmanimMethod: opt.id as any })}
                      className={`p-3 text-xs rounded-xl border text-center font-medium transition-colors cursor-pointer ${
                        (settings.zmanimMethod || 'gra') === opt.id
                          ? 'bg-amber-800 text-white font-bold border-amber-800 shadow-xs'
                          : isDark
                          ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily Study Schedule */}
              <div className={`p-4 rounded-2xl border space-y-4 ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                      הצגת באנר לימוד יומי בספרייה
                    </span>
                    <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                      קיצורי דרך לכל הלימודים היומיים בראש מסך הספרייה
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.showDailyStudy)}
                    onChange={e => onUpdateSettings({ showDailyStudy: e.target.checked })}
                    className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                  />
                </div>

                {/* Calculation Track Methods */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className={`text-xs font-semibold ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                      לוח הלכה יומית:
                    </label>
                    <select
                      value={settings.halachaYomitScheduleType || 'dirshu_mishna_berura'}
                      onChange={e => onUpdateSettings({ halachaYomitScheduleType: e.target.value as any })}
                      className={`w-full rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                        isDark ? 'bg-stone-950 border border-stone-700 text-stone-100' : 'bg-white border border-stone-300 text-stone-900'
                      }`}
                    >
                      <option value="dirshu_mishna_berura">הדף היומי בהלכה (דרשו - משנה ברורה)</option>
                      <option value="shulchan_aruch">שולחן ערוך אורח חיים (סעיף/סימן ליום)</option>
                      <option value="kitzur_shulchan_aruch">קיצור שולחן ערוך (גנצפריד)</option>
                      <option value="rambam_halacha">משנה תורה לרמב"ם (ספר המדע / הלכות)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={`text-xs font-semibold ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                      לוח חפץ חיים ושמירת הלשון:
                    </label>
                    <select
                      value={settings.chofetzChaimScheduleType || 'world_three_times'}
                      onChange={e => onUpdateSettings({ chofetzChaimScheduleType: e.target.value as any })}
                      className={`w-full rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                        isDark ? 'bg-stone-950 border border-stone-700 text-stone-100' : 'bg-white border border-stone-300 text-stone-900'
                      }`}
                    >
                      <option value="world_three_times">לוח הגרז״ו סגל - 3 פעמים בשנה (מחזור 4 חודשים - ברירת מחדל)</option>
                      <option value="world_annual">לוח החפץ חיים - סבב שנתי (מתשרי עד אלול)</option>
                      <option value="world_biannual">לוח החפץ חיים - סבב חצי-שנתי</option>
                      <option value="daily_order">סדר רציף שער אחר שער</option>
                    </select>
                  </div>
                </div>

                {/* Custom Study Manage Button */}
                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                  isDark ? 'bg-stone-950/60 border-stone-800' : 'bg-white border-stone-200'
                }`}>
                  <div>
                    <span className="font-semibold text-xs block">לימודים יומיים מותאמים אישית</span>
                    <span className="text-[11px] text-stone-400">
                      {settings.customDailyStudies && settings.customDailyStudies.length > 0
                        ? `מוגדרים ${settings.customDailyStudies.length} לימודים מותאמים אישית`
                        : 'הוסף ספרים וקצבי לימוד עצמאיים'}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsCustomStudyModalOpen(true)}
                    className="px-3 py-1.5 bg-amber-800/20 hover:bg-amber-800 hover:text-white text-amber-900 dark:text-amber-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>נהל לימודים אישיים</span>
                  </button>
                </div>

                <div className={`pt-3 border-t space-y-2.5 ${isDark ? 'border-stone-800' : 'border-stone-200/80'}`}>
                  <span className={`text-xs font-bold block ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                    מסלולי לימוד יומיים פעילים:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'dafYomi', label: 'דף יומי בבלי (מחושב לפי מחזור הש"ס)' },
                      { key: 'chofetzChaim', label: 'ספר חפץ חיים ושמירת הלשון' },
                      { key: 'halachaYomit', label: 'הלכה יומית (משנה ברורה / דרשו)' },
                      { key: 'parasha', label: 'פרשת השבוע ושניים מקרא' }
                    ].map(track => {
                      const tracks = settings.dailyStudyTracks || {
                        dafYomi: true,
                        parasha: true,
                        chofetzChaim: true,
                        halachaYomit: true
                      };
                      const isChecked = (tracks as any)[track.key] !== false;
                      return (
                        <label
                          key={track.key}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors cursor-pointer select-none ${
                            isChecked
                              ? isDark
                                ? 'bg-amber-950/60 border-amber-800 text-amber-200 font-medium'
                                : 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium'
                              : isDark
                              ? 'bg-stone-900 border-stone-800 text-stone-400'
                              : 'bg-white border-stone-200 text-stone-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e =>
                              onUpdateSettings({
                                dailyStudyTracks: {
                                  ...tracks,
                                  [track.key]: e.target.checked
                                }
                              })
                            }
                            className="accent-amber-800 rounded"
                          />
                          <span>{track.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: KEYBOARD SHORTCUTS (Aligned with shortcuts_settings_tab.dart) */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <p className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                התאמה אישית של קיצורי המקלדת לניווט מהיר וללא שימוש בעכבר:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: 'nextPage', label: 'דף / עמוד הבא בספר', defaultKey: 'PageDown' },
                  { key: 'prevPage', label: 'דף / עמוד הקודם בספר', defaultKey: 'PageUp' },
                  { key: 'nextChapter', label: 'פרק / סימן הבא', defaultKey: 'Alt+ArrowDown' },
                  { key: 'prevChapter', label: 'פרק / סימן הקודם', defaultKey: 'Alt+ArrowUp' },
                  { key: 'searchBook', label: 'חיפוש בתוך הספר', defaultKey: 'Ctrl+F' },
                  { key: 'searchGlobal', label: 'חיפוש כללי במאגר', defaultKey: 'Ctrl+Shift+F' },
                  { key: 'toggleCommentary', label: 'פתיחה/סגירת פאנל מפרשים', defaultKey: 'Ctrl+M' },
                  { key: 'toggleToc', label: 'פתיחה/סגירת תוכן עניינים', defaultKey: 'Ctrl+T' },
                  { key: 'increaseFont', label: 'הגדלת גופן', defaultKey: 'Ctrl+=' },
                  { key: 'decreaseFont', label: 'הקטנת גופן', defaultKey: 'Ctrl+-' }
                ].map(item => {
                  const currentKey = (settings.shortcuts as any)?.[item.key] || item.defaultKey;
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
                      }`}
                    >
                      <span className={`text-xs font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>{item.label}</span>
                      <input
                        type="text"
                        value={currentKey}
                        onChange={e =>
                          onUpdateSettings({
                            shortcuts: {
                              ...settings.shortcuts,
                              [item.key]: e.target.value
                            }
                          })
                        }
                        className={`w-28 text-center text-xs font-mono py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                          isDark ? 'bg-stone-950 border-stone-700 text-amber-400' : 'bg-white border-stone-300 text-amber-900 font-bold'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 8: SYSTEM & BACKUP */}
          {activeTab === 'system' && (
            <div className="space-y-5">
              {/* Session Persistence & Auto Restore */}
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col">
                  <span className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                    שחזור אוטומטי של ספרים מהביקור האחרון
                  </span>
                  <span className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    פתיחה אוטומטית של כל הלשוניות והדפים שהיו פתוחים בסשן הקודם בעת כניסה לאתר
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoRestoreSession !== false}
                  onChange={e => onUpdateSettings({ autoRestoreSession: e.target.checked })}
                  className="w-5 h-5 accent-amber-800 cursor-pointer rounded"
                />
              </div>

              {/* Backup & Restore */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50 border-stone-200'
              }`}>
                <div className="flex flex-col gap-1">
                  <h4 className={`font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>
                    גיבוי ושחזור נתונים (Backup & Restore)
                  </h4>
                  <p className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    קובץ גיבוי זה מכיל את כל הסימניות, היסטוריית הקריאה וההגדרות האישיות שלך.
                  </p>
                </div>

                {restoreMessage && (
                  <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs rounded-xl font-bold">
                    {restoreMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => downloadBackupJson()}
                    className="p-3 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>ייצוא גיבוי לקובץ JSON</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                      isDark
                        ? 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                        : 'bg-white hover:bg-stone-100 border-stone-300 text-stone-800'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>ייבוא ושחזור מגיבוי</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => handleFileUpload(e, 'replace')}
                />
              </div>

              {/* Reset to defaults */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                isDark ? 'bg-red-950/30 border-red-900/60' : 'bg-red-50/60 border-red-200'
              }`}>
                <div>
                  <h4 className={`font-semibold text-xs ${isDark ? 'text-red-300' : 'text-stone-800'}`}>
                    איפוס כל ההגדרות
                  </h4>
                  <p className={`text-[11px] ${isDark ? 'text-red-400' : 'text-stone-500'}`}>
                    מחזיר את כל הגדרות הקריאה, הגופנים והמראה לברירות המחדל של תוכנת אוצריא
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm('האם אתה בטוח שברצונך לאפס את כל ההגדרות לברירות המחדל?')) {
                      await resetUserSettingsOnCloud();
                      onResetSettings();
                    }
                  }}
                  className="px-4 py-2 bg-red-800 hover:bg-red-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>איפוס הגדרות</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Study Modal */}
      {isCustomStudyModalOpen && (
        <CustomStudyModal
          isOpen={isCustomStudyModalOpen}
          onClose={() => setIsCustomStudyModalOpen(false)}
          settings={settings}
          catalogBooks={catalogBooks}
          onUpdateSettings={onUpdateSettings}
        />
      )}
    </div>
  );
};
