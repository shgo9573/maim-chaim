import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, ScrollText } from 'lucide-react';
import { useApp } from '../store';
import { Btn, Select } from './ui';
import { dafYomiFor } from '../utils/dailyStudy';
import { toHebrewNumber } from '../utils/text';
import { MASECHTOT, masechtaForName } from '../utils/talmud';

/** Internal Daf selector and local PDF viewer for Tzurat HaDaf. */
export default function TzuratHaDaf() {
  const { settings } = useApp();
  const lang = settings.interfaceLanguage;

  const today = useMemo(() => dafYomiFor(new Date()), []);
  const initial = useMemo(() => {
    const match = today && masechtaForName(today.name);
    return { masechta: match?.he ?? 'ברכות', daf: match ? Number(today?.blatt) || 2 : 2 };
  }, [today]);

  const [masechta, setMasechta] = useState(initial.masechta);
  const [daf, setDaf] = useState(initial.daf);
  const [amud, setAmud] = useState<'a' | 'b'>('a');
  const last = MASECHTOT.find((m) => m.he === masechta)?.last ?? 64;

  const step = (dir: 1 | -1) => {
    if (dir === 1) {
      if (amud === 'a') setAmud('b');
      else {
        setAmud('a');
        setDaf((d) => Math.min(last, d + 1));
      }
    } else if (amud === 'b') setAmud('a');
    else {
      setAmud('b');
      setDaf((d) => Math.max(2, d - 1));
    }
  };


  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <ScrollText size={52} className="mb-4 text-primary opacity-60" />
      <h2 className="mb-2 flex items-center justify-center gap-2 text-xl font-medium">
        {lang === 'en' ? 'Page layout' : 'צורת הדף'}
      </h2>
      <p className="mb-5 max-w-md text-sm leading-relaxed text-on-variant">
        {lang === 'en'
          ? 'Choose a tractate and folio to view the original printed page inside Otzaria.'
          : 'בחרו מסכת ודף כדי לפתוח את הגמרא בתצוגת צורת הדף לצד המפרשים.'}
      </p>

      <div className="mb-6 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-surface-1 p-3">
        <Select value={masechta} onChange={(m) => { setMasechta(m); setDaf(2); setAmud('a'); }} options={MASECHTOT.map((m) => ({ value: m.he, label: m.he }))} />
        <Select value={daf} onChange={setDaf} options={Array.from({ length: last - 1 }, (_, i) => ({ value: i + 2, label: toHebrewNumber(i + 2) }))} />
        <Select value={amud} onChange={setAmud} options={[{ value: 'a' as const, label: 'ע"א' }, { value: 'b' as const, label: 'ע"ב' }]} />
        <button onClick={() => step(-1)} className="rounded-full p-2 text-on-variant hover:bg-surface-3" title="עמוד קודם"><ChevronRight size={18} /></button>
        <button onClick={() => step(1)} className="rounded-full p-2 text-on-variant hover:bg-surface-3" title="עמוד הבא"><ChevronLeft size={18} /></button>
      </div>

      {today && (
        <button
          onClick={() => {
            const m = masechtaForName(today.name);
            if (m) {
              setMasechta(m.he);
              setDaf(Number(today.blatt) || 2);
              setAmud('a');
            }
          }}
          className="mb-4 rounded-full bg-sec-container px-3 py-1 text-xs text-on-sec-container"
        >
          {lang === 'en' ? 'Today’s daf' : 'הדף היומי'}: {today.label}
        </button>
      )}

      <Btn variant="filled" onClick={() => {
        const params = new URLSearchParams({
          masechta,
          daf: String(daf),
          amud,
          theme: settings.theme === 'dark' ? 'dark' : 'light',
        });
        window.open(`/tzuratadaf?${params.toString()}`, '_blank', 'noopener,noreferrer');
      }}>
        <BookOpen size={16} /> {lang === 'en' ? 'Experimental page layout' : `צורת הדף · ${masechta} ${toHebrewNumber(daf)} ע"${amud === 'a' ? 'א' : 'ב'}`}
      </Btn>

    </div>
  );
}
