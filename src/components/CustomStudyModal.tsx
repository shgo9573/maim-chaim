import React, { useState } from 'react';
import { CustomDailyStudy, BookItem, ReaderSettings } from '../types/otzaria';
import { X, Plus, BookOpen, Trash2, Calendar, Check, Edit2 } from 'lucide-react';

interface CustomStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  catalogBooks: BookItem[];
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
}

export const CustomStudyModal: React.FC<CustomStudyModalProps> = ({
  isOpen,
  onClose,
  settings,
  catalogBooks,
  onUpdateSettings
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [selectedBookTitle, setSelectedBookTitle] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<number | string | undefined>(undefined);
  const [paceType, setPaceType] = useState<'page' | 'daf' | 'chapter' | 'siman' | 'custom'>('chapter');
  const [unitsPerDay, setUnitsPerDay] = useState<number>(1);
  const [currentUnit, setCurrentUnit] = useState<number>(1);
  const [totalUnits, setTotalUnits] = useState<number>(30);
  const [description, setDescription] = useState('');
  const [bookSearch, setBookSearch] = useState('');

  if (!isOpen) return null;

  const isDark = settings.theme === 'dark';
  const customStudies = settings.customDailyStudies || [];

  const handleResetForm = () => {
    setEditingId(null);
    setTitle('');
    setSelectedBookTitle('');
    setSelectedBookId(undefined);
    setPaceType('chapter');
    setUnitsPerDay(1);
    setCurrentUnit(1);
    setTotalUnits(30);
    setDescription('');
    setBookSearch('');
  };

  const handleStartEdit = (study: CustomDailyStudy) => {
    setEditingId(study.id);
    setTitle(study.title);
    setSelectedBookTitle(study.bookTitle);
    setSelectedBookId(study.bookId);
    setPaceType(study.paceType);
    setUnitsPerDay(study.unitsPerDay || 1);
    setCurrentUnit(study.currentUnit || 1);
    setTotalUnits(study.totalUnits || 30);
    setDescription(study.description || '');
  };

  const handleSave = () => {
    if (!title.trim() || !selectedBookTitle.trim()) {
      alert('נא להזין שם לימוד ולבחור ספר יעד');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    let updatedList: CustomDailyStudy[];
    if (editingId) {
      updatedList = customStudies.map(item =>
        item.id === editingId
          ? {
              ...item,
              title: title.trim(),
              bookTitle: selectedBookTitle.trim(),
              bookId: selectedBookId,
              paceType,
              unitsPerDay: Number(unitsPerDay) || 1,
              currentUnit: Number(currentUnit) || 1,
              totalUnits: Number(totalUnits) || 30,
              description: description.trim(),
              active: true
            }
          : item
      );
    } else {
      const newStudy: CustomDailyStudy = {
        id: `custom-study-${Date.now()}`,
        title: title.trim(),
        bookTitle: selectedBookTitle.trim(),
        bookId: selectedBookId,
        paceType,
        unitsPerDay: Number(unitsPerDay) || 1,
        currentUnit: Number(currentUnit) || 1,
        totalUnits: Number(totalUnits) || 30,
        startDate: todayStr,
        description: description.trim(),
        active: true
      };
      updatedList = [...customStudies, newStudy];
    }

    onUpdateSettings({
      customDailyStudies: updatedList,
      showDailyStudy: true
    });

    handleResetForm();
  };

  const handleDelete = (id: string) => {
    const updated = customStudies.filter(s => s.id !== id);
    onUpdateSettings({ customDailyStudies: updated });
    if (editingId === id) handleResetForm();
  };

  const handleToggleActive = (id: string, current: boolean) => {
    const updated = customStudies.map(s => (s.id === id ? { ...s, active: !current } : s));
    onUpdateSettings({ customDailyStudies: updated });
  };

  const filteredBooks = bookSearch.trim()
    ? catalogBooks.filter(b => b.title.toLowerCase().includes(bookSearch.toLowerCase())).slice(0, 8)
    : catalogBooks.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden ${
          isDark ? 'bg-[#211711] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-stone-50/90 border-stone-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-800 text-amber-100 rounded-2xl shadow-xs">
              <Calendar className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-serif">הוספת וניהול לימוד יומי מותאם אישית</h3>
              <p className="text-xs text-stone-400">הגדרת מסלול קריאה ולימוד יומי לפי הקצב האישי שלך</p>
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* Form */}
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              isDark ? 'bg-stone-900/60 border-stone-800' : 'bg-stone-50/70 border-stone-200'
            }`}
          >
            <h4 className="font-bold text-amber-700 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>{editingId ? 'עריכת לימוד יומי' : 'הגדרת לימוד יומי חדש'}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">שם הלימוד / כותרת:</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="לדוגמה: שפת אמת לפרשה / מסילת ישרים"
                  className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-700 ${
                    isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ספר יעד באוצריה:</label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={selectedBookTitle || bookSearch}
                    onChange={e => {
                      setSelectedBookTitle(e.target.value);
                      setBookSearch(e.target.value);
                    }}
                    placeholder="חפש ובחר ספר מהספרייה..."
                    className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-700 ${
                      isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'
                    }`}
                  />
                  {bookSearch && filteredBooks.length > 0 && (
                    <div
                      className={`max-h-28 overflow-y-auto rounded-xl border shadow-md p-1 text-xs space-y-1 ${
                        isDark ? 'bg-stone-950 border-stone-700' : 'bg-white border-stone-200'
                      }`}
                    >
                      {filteredBooks.map((b, idx) => (
                        <button
                          key={`custom-study-book-${b.id}-${idx}`}
                          onClick={() => {
                            setSelectedBookTitle(b.title);
                            setSelectedBookId(b.id);
                            setBookSearch('');
                          }}
                          className={`w-full text-right px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                            isDark ? 'hover:bg-stone-800' : 'hover:bg-amber-50'
                          }`}
                        >
                          <span className="font-semibold">{b.title}</span>
                          <span className="text-[10px] text-stone-400">{b.categoryPath}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pace Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">יחידת לימוד:</label>
                <select
                  value={paceType}
                  onChange={e => setPaceType(e.target.value as any)}
                  className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none ${
                    isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'
                  }`}
                >
                  <option value="chapter">פרק ליום</option>
                  <option value="daf">דף ליום</option>
                  <option value="page">עמוד ליום</option>
                  <option value="siman">סימן ליום</option>
                  <option value="custom">יחידה מותאמת</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">כמות יחידות ליום:</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={unitsPerDay}
                  onChange={e => setUnitsPerDay(Number(e.target.value))}
                  className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none ${
                    isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">מיקום התחלתי / נוכחי:</label>
                <input
                  type="number"
                  min="1"
                  value={currentUnit}
                  onChange={e => setCurrentUnit(Number(e.target.value))}
                  className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none ${
                    isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">הערות ותיאור (אופציונלי):</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="הערה לתזכורת או יעד סיום..."
                className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none ${
                  isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {editingId && (
                <button
                  onClick={handleResetForm}
                  className={`px-4 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                    isDark ? 'bg-stone-800 text-stone-300 hover:bg-stone-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                >
                  ביטול עריכה
                </button>
              )}
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'שמור שינויים' : 'הוסף לימוד יומי'}</span>
              </button>
            </div>
          </div>

          {/* Existing Custom Studies List */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wide text-stone-500">
              הלימודים המותאמים אישית שלך ({customStudies.length})
            </h4>

            {customStudies.length === 0 ? (
              <div
                className={`p-6 rounded-2xl border text-center text-xs ${
                  isDark ? 'border-stone-800 text-stone-400 bg-stone-900/30' : 'border-stone-200 text-stone-500 bg-stone-50'
                }`}
              >
                טרם הגדרת לימודים מותאמים אישית. תוכל להוסיף ספרי קודש וסדרי לימוד אישיים בטופס למעלה.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {customStudies.map(study => (
                  <div
                    key={study.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                      study.active
                        ? isDark
                          ? 'bg-stone-900/80 border-stone-700'
                          : 'bg-white border-stone-200 shadow-xs'
                        : isDark
                        ? 'bg-stone-950/40 border-stone-800 opacity-60'
                        : 'bg-stone-100/50 border-stone-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={study.active}
                        onChange={() => handleToggleActive(study.id, study.active)}
                        className="w-4 h-4 accent-amber-800 cursor-pointer rounded"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-serif text-sm">{study.title}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-sans ${
                              isDark ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            ספר: {study.bookTitle}
                          </span>
                        </div>
                        <div className="text-xs text-stone-400 flex items-center gap-2 mt-0.5">
                          <span>
                            קצב: {study.unitsPerDay || 1} {study.paceType === 'daf' ? 'דף' : study.paceType === 'page' ? 'עמוד' : 'פרק'}/יום
                          </span>
                          {study.description && <span>• {study.description}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleStartEdit(study)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isDark ? 'hover:bg-stone-800 text-stone-300' : 'hover:bg-stone-100 text-stone-600'
                        }`}
                        title="ערוך לימוד"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(study.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer text-red-600 ${
                          isDark ? 'hover:bg-red-950/60' : 'hover:bg-red-50'
                        }`}
                        title="מחק לימוד"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3 border-t flex items-center justify-end ${
            isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-stone-50 border-stone-200'
          }`}
        >
          <button
            onClick={onClose}
            className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
