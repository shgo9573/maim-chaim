import { useApp } from '../store';
import { Modal } from './ui';

export function AboutDialog() {
  const { setDialog, library } = useApp();
  return (
    <Modal title="אודות מיים חיים" onClose={() => setDialog(null)}>
      <div className="space-y-4 px-6 pb-6 text-sm leading-relaxed">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-on-primary" style={{ fontFamily: '"Frank Ruhl Libre"' }}>
            מ
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ fontFamily: '"Frank Ruhl Libre"' }}>
              מיים חיים
            </div>
            <div className="text-on-variant">מאגר ספרים תורני מקוון – מבוסס על אוצריא</div>
          </div>
        </div>
        <p>
          האתר מבוסס על תוכנת <b>אוצריא</b> – תוכנה חופשית ופתוחה שמטרתה להנגיש את הספרייה היהודית לכולם בממשק מודרני ונוח. התוכנה חינמית ותישאר חינמית לעד.
        </p>
        {library && <p className="text-on-variant">בספרייה זו {library.books.length.toLocaleString('he-IL')} ספרים.</p>}
        <p className="text-on-variant">
          גרסת ה-Web מתחברת לשרת otzaria.duckdns.org. הקוד המקורי של התוכנה זמין תחת רישיון GPL-3.0.
        </p>
        <a href="https://github.com/otzaria/otzaria" target="_blank" rel="noreferrer" className="inline-block text-primary underline">
          github.com/otzaria/otzaria
        </a>
      </div>
    </Modal>
  );
}
