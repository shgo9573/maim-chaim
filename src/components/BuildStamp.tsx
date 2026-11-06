// src/components/BuildStamp.tsx

declare const __BUILD_TIME__: string;

export function BuildStamp() {
  const t = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'לא ידוע';
  const d = new Date(t);
  return (
    <div className="fixed bottom-1 left-1 text-[10px] text-gray-400 select-none z-50 font-mono" dir="ltr">
      🕒 {isNaN(d.getTime()) ? t : d.toLocaleString('he-IL')}
    </div>
  );
}
