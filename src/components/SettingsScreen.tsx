import { useEffect, useState, type ReactNode } from 'react';
import { Copy, LogIn, LogOut, Moon, RotateCcw, Sun } from 'lucide-react';
import { getUid } from '../api';
import { login, register } from '../auth';
import { useApp } from '../store';
import { Btn, Select, Switch } from './ui';
import { isValidHex, PRESET_COLORS } from '../utils/theme';
import type { ReaderSettings } from '../types';
import { t } from '../i18n';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const lang = useApp().settings.interfaceLanguage;
  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-outline-variant bg-surface-1">
      <h3 className="px-5 pt-4 pb-1 text-sm font-bold text-primary">{t(title, lang)}</h3>
      <div className="divide-y divide-outline-variant/60">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const lang = useApp().settings.interfaceLanguage;
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <div className="text-[15px]">{t(label, lang)}</div>
        {hint && <div className="text-xs text-on-variant">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step = 1, onChange, suffix = '' }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-36 accent-[var(--c-primary)] md:w-52" />
      <span className="w-12 text-center text-sm text-on-variant">
        {value}
        {suffix}
      </span>
    </div>
  );
}

const FONTS = ['Frank Ruhl Hofshi', 'David Libre', 'Heebo', 'Taamey Frank CLM', 'Keter YG'].map((f) => ({ value: f, label: f }));
const C_FONTS = ['Frank Ruhl Hofshi', 'David Libre', 'Heebo', 'Rashi'].map((f) => ({ value: f, label: f }));

function AccountSection() {
  const { account, setAccount, signOut, toast, resetSettings } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'register' && password !== password2) throw new Error('הסיסמאות אינן תואמות');
      const acc = mode === 'register' ? await register(email, password) : await login(email, password);
      setAccount(acc);
      setPassword('');
      setPassword2('');
      toast(mode === 'register' ? 'החשבון נוצר ואתם מחוברים' : 'התחברת בהצלחה');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="חשבון">
      {account ? (
        <div className="divide-y divide-outline-variant/60">
          <Row label={account.email} hint={`מחובר · מזהה ${account.uid.slice(0, 8)}…`}>
            <Btn variant="outlined" onClick={signOut}>
              <LogOut size={15} /> התנתק
            </Btn>
          </Row>
          <div className="px-5 pb-4 pt-3 text-xs text-on-variant">
            הסימניות, ההיסטוריה, ההגדרות והחידושים נשמרים בשרת לפי מזהה המשתמש המשויך לאימייל הזה.
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4 border-b border-outline-variant/60">
          <div className="flex gap-1 rounded-full bg-surface-2 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setErr('');
                }}
                className={`flex-1 rounded-full py-1.5 text-sm transition ${mode === m ? 'bg-primary text-on-primary' : 'text-on-variant hover:bg-surface-3'}`}
              >
                {m === 'login' ? 'התחברות' : 'הרשמה'}
              </button>
            ))}
          </div>
          <input
            dir="ltr"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-10 w-full rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          <input
            dir="ltr"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="סיסמה (6 תווים לפחות)"
            className="h-10 w-full rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          {mode === 'register' && (
            <input
              dir="ltr"
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="אימות סיסמה"
              className="h-10 w-full rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          )}
          {err && <div className="text-sm text-error">{err}</div>}
          <Btn variant="filled" className="w-full" onClick={submit} disabled={busy || !email || !password}>
            <LogIn size={16} /> {mode === 'register' ? 'צור חשבון' : 'התחבר'}
          </Btn>
          <p className="text-xs leading-relaxed text-on-variant">
            הסיסמה נשמרת מוצפנת בדפדפן בלבד; השרת הנוכחי תומך רק בשיוך אימייל למזהה משתמש ואינו מאמת סיסמאות. כניסה עם אותו אימייל במכשיר אחר תטען את אותו פרופיל מהשרת.
          </p>
        </div>
      )}
      <Row label="מזהה משתמש (UUID)" hint={getUid()}>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(getUid());
            toast('המזהה הועתק');
          }}
          className="flex items-center gap-2 rounded-lg bg-surface-3 px-3 py-1.5 text-xs"
          dir="ltr"
        >
          העתק מזהה <Copy size={13} />
        </button>
      </Row>
      <Row label="איפוס הגדרות ומחיקת עוגיות" hint="איפוס כל ההגדרות לברירת המחדל">
        <Btn
          variant="outlined"
          onClick={async () => {
            if (confirm('לאפס את כל ההגדרות?')) {
              await resetSettings();
              toast('ההגדרות אופסו');
            }
          }}
        >
          <RotateCcw size={15} /> אפס
        </Btn>
      </Row>
    </Section>
  );
}

function ColorPicker() {
  const { settings, updateSettings } = useApp();
  const current = settings.seedColor || '#7a5640';
  const brightness = Number(settings.uiBrightness) || 0;
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            onClick={() => updateSettings({ seedColor: c.hex })}
            className={`h-9 w-9 rounded-full border-2 transition ${current.toLowerCase() === c.hex ? 'border-on-surface scale-110' : 'border-transparent hover:scale-105'}`}
            style={{ background: c.hex }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={isValidHex(text) ? (text.startsWith('#') ? text : '#' + text) : current}
          onChange={(e) => updateSettings({ seedColor: e.target.value })}
          className="h-10 w-16 cursor-pointer rounded-lg border border-outline bg-surface p-1"
          title="בחירת צבע חופשית"
        />
        <input
          dir="ltr"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (isValidHex(e.target.value)) updateSettings({ seedColor: e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value });
          }}
          placeholder="#7a5640"
          className="h-10 w-32 rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <Btn variant="outlined" onClick={() => updateSettings({ seedColor: undefined })}>
          <RotateCcw size={14} /> ברירת מחדל
        </Btn>
      </div>
      <div className="space-y-1 border-t border-outline-variant/60 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span>בהירות הממשק</span>
          <span className="text-xs text-on-variant tabular-nums">{brightness > 0 ? `+${brightness}` : brightness}</span>
        </div>
        <div className="flex items-center gap-3">
          <Moon size={15} className="shrink-0 text-on-variant" />
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={brightness}
            onChange={(e) => updateSettings({ uiBrightness: Number(e.target.value) })}
            className="flex-1 accent-[var(--c-primary)]"
          />
          <Sun size={16} className="shrink-0 text-on-variant" />
          <Btn variant="outlined" onClick={() => updateSettings({ uiBrightness: 0 })}>
            אפס
          </Btn>
        </div>
      </div>
      <div className="text-xs text-on-variant">הצבע והבהירות נשמרים בחשבון שלכם ומשפיעים על כל הממשק בכל ערכות הנושא.</div>
    </div>
  );
}

function ReaderLayoutSettings() {
  const { settings, updateSettings } = useApp();
  return (
    <Section title="פריסה בקורא">
      <Row label="המפרשים פתוחים כברירת מחדל">
        <Switch checked={settings.commentaryOpenByDefault ?? true} onChange={(v) => updateSettings({ commentaryOpenByDefault: v })} />
      </Row>
      <Row label="רוחב חלונית המפרשים">
        <Slider value={settings.commentaryPanelWidth ?? 19} min={12} max={40} onChange={(v) => updateSettings({ commentaryPanelWidth: v })} suffix="%" />
      </Row>
      <Row label="רוחב חלונית הניווט">
        <Slider value={settings.navigationPanelWidth ?? 16} min={12} max={25} onChange={(v) => updateSettings({ navigationPanelWidth: v })} suffix="%" />
      </Row>
      <Row label="הגדרות פר-ספר" hint="בעת גרירת חלוניות, שמור רוחב/פתיחה נפרדים לספר הנוכחי">
        <Switch checked={settings.perBookSettingsEnabled} onChange={(v) => updateSettings({ perBookSettingsEnabled: v })} />
      </Row>
      <div className="px-5 pb-4 pt-1 text-xs text-on-variant">
        אפשר לגרור את הגבולות שבין חלוניות המפרשים, הניווט והספר. כאשר הגדרות פר-ספר פועלות, השינוי נשמר בנפרד לכל ספר; אחרת הוא מעדכן את ברירת המחדל.
      </div>
    </Section>
  );
}

export default function SettingsScreen() {
  const { settings: s, updateSettings } = useApp();
  const set = <K extends keyof ReaderSettings>(k: K, v: ReaderSettings[K]) => updateSettings({ [k]: v } as Partial<ReaderSettings>);

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <h1 className="mb-5 text-2xl font-medium">{t('הגדרות', s.interfaceLanguage)}</h1>

        <AccountSection />

        <Section title="שפה">
          <Row label="שפת ממשק" hint="ברירת המחדל היא עברית. טקסט הספרים נשאר בעברית.">
            <Select
              value={s.interfaceLanguage || 'he'}
              onChange={(language) => updateSettings({ interfaceLanguage: language })}
              options={[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }]}
            />
          </Row>
        </Section>

        <Section title="צבע הממשק">
          <ColorPicker />
        </Section>

        <Section title="מראה">
          <Row label="ערכת נושא">
            <Select
              value={s.theme}
              onChange={(v) => set('theme', v)}
              options={[
                { value: 'light', label: 'בהירה' },
                { value: 'sepia', label: 'ספיה' },
                { value: 'dark', label: 'כהה' },
              ]}
            />
          </Row>
          <Row label="תצוגת ספרייה">
            <Select
              value={s.libraryViewMode}
              onChange={(v) => set('libraryViewMode', v)}
              options={[
                { value: 'list', label: 'רשימה' },
                { value: 'grid', label: 'רשת' },
              ]}
            />
          </Row>
          <Row label="הצג תיאור ספר בריחוף">
            <Switch checked={s.showBookPreview} onChange={(v) => set('showBookPreview', v)} />
          </Row>
        </Section>

        <ReaderLayoutSettings />

        <Section title="תלמוד וצורת הדף">
          <Row
            label="פתח מסכתות תמיד בצורת הדף"
            hint="בעת פתיחת מסכת בבלי, תיפתח צורת הדף בלשונית דפדפן נפרדת במקום קורא הטקסט."
          >
            <Switch
              checked={s.talmudBavliOpenFormat === 'pdf'}
              onChange={(enabled) => set('talmudBavliOpenFormat', enabled ? 'pdf' : 'text')}
            />
          </Row>
        </Section>

        <Section title="הגדרות קורא">
          <Row label="גופן ראשי">
            <Select value={s.fontFamily} onChange={(v) => set('fontFamily', v)} options={FONTS} />
          </Row>
          <Row label="גודל גופן">
            <Slider value={s.fontSize} min={12} max={48} onChange={(v) => set('fontSize', v)} />
          </Row>
          <Row label="גופן מפרשים">
            <Select value={s.commentaryFontFamily} onChange={(v) => set('commentaryFontFamily', v)} options={C_FONTS} />
          </Row>
          <Row label="גודל גופן מפרשים">
            <Slider value={s.commentaryFontSize} min={10} max={36} onChange={(v) => set('commentaryFontSize', v)} />
          </Row>
          <Row label="מרווח שורות">
            <Slider value={s.lineHeight} min={1.1} max={2.6} step={0.1} onChange={(v) => set('lineHeight', Math.round(v * 10) / 10)} />
          </Row>
          <Row label="רוחב טקסט מרבי">
            <Select
              value={s.textMaxWidth}
              onChange={(v) => set('textMaxWidth', v)}
              options={(['70%', '80%', '90%', '100%'] as const).map((v) => ({ value: v, label: v }))}
            />
          </Row>
          <Row label="מצב קריאה רציפה" hint="הצגת השורות ברצף ללא ירידת שורה">
            <Switch checked={s.continuousReadingMode} onChange={(v) => set('continuousReadingMode', v)} />
          </Row>
          <Row label="תצוגת מפרשים">
            <Select
              value={s.commentaryViewMode}
              onChange={(v) => set('commentaryViewMode', v)}
              options={[
                { value: 'auto', label: 'אוטומטי' },
                { value: 'side_panel', label: 'פאנל צדדי' },
                { value: 'inline', label: 'מוסתר כברירת מחדל' },
              ]}
            />
          </Row>
          <Row label="הצג מראי מקום מעל המפרשים">
            <Switch checked={s.showCommentaryMarkers} onChange={(v) => set('showCommentaryMarkers', v)} />
          </Row>
        </Section>

        <Section title="ניקוד וטעמים">
          <Row label="הצג ניקוד">
            <Switch checked={s.showNikud} onChange={(v) => set('showNikud', v)} />
          </Row>
          <Row label="מדיניות ניקוד">
            <Select
              value={s.nikudPolicy}
              onChange={(v) => set('nikudPolicy', v)}
              options={[
                { value: 'all', label: 'בכל הספרים' },
                { value: 'tanakh_only', label: 'בתנ"ך בלבד' },
                { value: 'none', label: 'ללא' },
              ]}
            />
          </Row>
          <Row label="הצג טעמי מקרא">
            <Switch checked={s.showTeamim} onChange={(v) => set('showTeamim', v)} />
          </Row>
          <Row label="הצג סימני פיסוק">
            <Switch checked={s.showPunctuation} onChange={(v) => set('showPunctuation', v)} />
          </Row>
          <Row label="החלפת שם ה'">
            <Select
              value={s.holyNameReplacement}
              onChange={(v) => set('holyNameReplacement', v)}
              options={["ה'", 'יי', "ד'", 'יהוה'].map((v) => ({ value: v, label: v }))}
            />
          </Row>
        </Section>

        <Section title="העתקה">
          <Row label="הוסף כותרת בהעתקה">
            <Select
              value={s.copyIncludeHeader}
              onChange={(v) => set('copyIncludeHeader', v)}
              options={[
                { value: 'always', label: 'תמיד' },
                { value: 'never', label: 'אף פעם' },
                { value: 'ask', label: 'שאל' },
              ]}
            />
          </Row>
          <Row label="פורמט כותרת">
            <Select
              value={s.copyHeaderFormat}
              onChange={(v) => set('copyHeaderFormat', v)}
              options={[
                { value: 'title_and_ref', label: 'שם הספר ומיקום' },
                { value: 'title_only', label: 'שם הספר בלבד' },
                { value: 'full_path', label: 'נתיב מלא' },
              ]}
            />
          </Row>
        </Section>

        <Section title="גימטריה">
          <Row label="שיטת חישוב">
            <Select
              value={s.gematriaMethod}
              onChange={(v) => set('gematriaMethod', v)}
              options={[
                { value: 'standard', label: 'רגילה' },
                { value: 'small', label: 'קטנה' },
                { value: 'atbash', label: 'אתב"ש' },
                { value: 'albam', label: 'אלב"ם' },
              ]}
            />
          </Row>
          <Row label="אותיות סופיות (500–900)">
            <Switch checked={s.gematriaIncludeSofiyot} onChange={(v) => set('gematriaIncludeSofiyot', v)} />
          </Row>
        </Section>


      </div>
    </div>
  );
}
