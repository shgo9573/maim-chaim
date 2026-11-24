import { useEffect, useMemo, useState, type LucideIcon } from 'react';
import { ArrowLeftRight, Box, Clock3, Copy, Ruler, Scale, Square } from 'lucide-react';
import { useApp } from '../store';
import {
  convertMeasurement,
  formatMeasurementValue,
  getDefaultMeasurementSelection,
  getMeasurementOpinions,
  getMeasurementUnitGroups,
  MEASUREMENT_CATEGORIES,
  needsMeasurementOpinion,
  type MeasurementCategory,
  type MeasurementSelection,
} from '../utils/measurementConverter';

const STORAGE_KEY = 'otzaria.measurements.v1';

const CATEGORY_META: { key: MeasurementCategory; icon: LucideIcon }[] = [
  { key: 'אורך', icon: Ruler },
  { key: 'שטח', icon: Square },
  { key: 'נפח', icon: Box },
  { key: 'משקל', icon: Scale },
  { key: 'זמן', icon: Clock3 },
];

function createDefaultSelections(): Record<MeasurementCategory, MeasurementSelection> {
  const defaults = {} as Record<MeasurementCategory, MeasurementSelection>;
  for (const category of MEASUREMENT_CATEGORIES) {
    defaults[category] = getDefaultMeasurementSelection(category);
  }
  return defaults;
}

function readSelections(): Record<MeasurementCategory, MeasurementSelection> {
  const defaults = createDefaultSelections();
  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<Record<MeasurementCategory, Partial<MeasurementSelection>>>;

    for (const category of MEASUREMENT_CATEGORIES) {
      const candidate = saved[category];
      if (!candidate) continue;
      const groups = getMeasurementUnitGroups(category);
      const opinions = getMeasurementOpinions(category);
      const validUnits = [...groups.ancient, ...groups.modern];

      defaults[category] = {
        value: typeof candidate.value === 'string' ? candidate.value.slice(0, 24) : defaults[category].value,
        fromUnit: typeof candidate.fromUnit === 'string' && validUnits.includes(candidate.fromUnit)
          ? candidate.fromUnit
          : defaults[category].fromUnit,
        toUnit: typeof candidate.toUnit === 'string' && validUnits.includes(candidate.toUnit)
          ? candidate.toUnit
          : defaults[category].toUnit,
        opinion: typeof candidate.opinion === 'string' && opinions.includes(candidate.opinion)
          ? candidate.opinion
          : defaults[category].opinion,
      };
    }
  } catch {
    return createDefaultSelections();
  }

  return defaults;
}

export default function MeasurementConverter() {
  const { toast } = useApp();
  const [category, setCategory] = useState<MeasurementCategory>('אורך');
  const [selections, setSelections] = useState(readSelections);
  const current = selections[category];
  const groups = getMeasurementUnitGroups(category);
  const opinions = getMeasurementOpinions(category);
  const showOpinion = needsMeasurementOpinion(category, current.fromUnit, current.toUnit);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {
      // The converter remains usable when browser storage is unavailable.
    }
  }, [selections]);

  const result = useMemo(
    () => convertMeasurement(category, current.value, current.fromUnit, current.toUnit, current.opinion),
    [category, current.value, current.fromUnit, current.toUnit, current.opinion],
  );

  const updateCurrent = (patch: Partial<MeasurementSelection>) => {
    setSelections((previous) => ({
      ...previous,
      [category]: { ...previous[category], ...patch },
    }));
  };

  const swapUnits = () => {
    updateCurrent({ fromUnit: current.toUnit, toUnit: current.fromUnit });
  };

  const copyResult = async () => {
    if (result === null) return;
    const text = current.value + ' ' + current.fromUnit + ' = ' + formatMeasurementValue(result) + ' ' + current.toUnit;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      toast('התוצאה הועתקה');
    } catch {
      toast('ההעתקה אינה זמינה בדפדפן הזה');
    }
  };

  const renderUnitCard = (
    title: string,
    selectedUnit: string,
    onSelect: (unit: string) => void,
  ) => (
    <section className="min-w-0 rounded-2xl border border-outline-variant bg-surface-1 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-primary">{title}</h3>
      <div className="space-y-3">
        <div>
          <div className="mb-2 text-xs font-semibold text-on-variant">חז"ל</div>
          <div className="flex flex-wrap gap-2">
            {groups.ancient.map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={selectedUnit === unit}
                onClick={() => onSelect(unit)}
                className={[
                  'rounded-full border px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none',
                  selectedUnit === unit
                    ? 'border-primary bg-primary-container font-semibold text-on-primary-container'
                    : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-2',
                ].join(' ')}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-on-variant">מודרני</div>
          <div className="flex flex-wrap gap-2">
            {groups.modern.map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={selectedUnit === unit}
                onClick={() => onSelect(unit)}
                className={[
                  'rounded-full border px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none',
                  selectedUnit === unit
                    ? 'border-primary bg-primary-container font-semibold text-on-primary-container'
                    : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-2',
                ].join(' ')}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const hasInput = current.value.trim().length > 0;
  const invalidInput = hasInput && (Number(current.value) < 0 || !Number.isFinite(Number(current.value)));

  return (
    <section className="space-y-4" aria-label="מדות ושיעורים">
      <header className="border-b border-outline-variant pb-3">
        <h2 className="text-xl font-semibold">מדות ושיעורים</h2>
        <p className="mt-1 text-sm text-on-variant">
          המרת מידות חז"ל ליחידות מודרניות ולהפך, לפי שיטות הפוסקים
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="קטגוריות המרה">
        {CATEGORY_META.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={category === key}
            onClick={() => setCategory(key)}
            className={[
              'flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
              category === key
                ? 'border-primary bg-primary-container font-semibold text-on-primary-container'
                : 'border-outline-variant bg-surface-1 text-on-surface hover:bg-surface-2',
            ].join(' ')}
          >
            <Icon size={17} aria-hidden="true" />
            {key}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-1 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-medium text-on-variant">ערך להמרה</span>
            <input
              id="measurement-value"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={current.value}
              onChange={(event) => updateCurrent({ value: event.target.value.slice(0, 24) })}
              className="w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-base text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-invalid={invalidInput}
            />
            {invalidInput && <span className="mt-1 block text-xs text-error">נא להזין מספר חיובי או אפס.</span>}
          </label>

          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-medium text-on-variant">שיטה</span>
            <select
              value={current.opinion}
              disabled={!showOpinion}
              onChange={(event) => updateCurrent({ opinion: event.target.value })}
              className="w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {opinions.map((opinion) => <option key={opinion} value={opinion}>{opinion}</option>)}
            </select>
            <span className="mt-1 block text-xs text-on-variant">
              {showOpinion ? 'נדרשת שיטה להמרה בין מידה קדומה למודרנית.' : 'בחירת השיטה פעילה רק בהמרה בין יחידות קדומות למודרניות.'}
            </span>
          </label>
        </div>
      </div>

      <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {renderUnitCard('המר מ:', current.fromUnit, (unit) => updateCurrent({ fromUnit: unit }))}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={swapUnits}
            aria-label="החלף יחידות"
            title="החלף יחידות"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant bg-surface-1 text-primary transition-colors hover:bg-surface-2 motion-reduce:transition-none"
          >
            <ArrowLeftRight size={19} />
          </button>
        </div>
        {renderUnitCard('המר ל:', current.toUnit, (unit) => updateCurrent({ toUnit: unit }))}
      </div>

      <div className="rounded-2xl bg-primary-container p-4 text-on-primary-container">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm opacity-80">
              {hasInput && result !== null ? current.value + ' ' + current.fromUnit + ' =' : 'תוצאה'}
            </div>
            <div className="mt-1 break-words text-3xl font-bold tabular-nums">
              {result === null ? '—' : formatMeasurementValue(result) + ' ' + current.toUnit}
            </div>
            {showOpinion && <div className="mt-1 text-xs opacity-80">לפי שיטת {current.opinion}</div>}
          </div>
          <button
            type="button"
            onClick={() => void copyResult()}
            disabled={result === null}
            className="flex items-center gap-2 rounded-full border border-on-primary-container/30 px-3 py-2 text-sm font-medium transition-colors hover:bg-on-primary-container/10 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            <Copy size={16} />
            העתק תוצאה
          </button>
        </div>
        {showOpinion && !current.opinion && (
          <p className="mt-2 text-sm">נא לבחור שיטה כדי לחשב את ההמרה.</p>
        )}
      </div>
    </section>
  );
}
