import { useEffect } from 'react';
import { getUid } from '../api';
import { useApp } from '../store';

export default function DailyNotifications() {
  const { settings, setScreen } = useApp();
  useEffect(() => {
    if (!settings.dailyNotificationsEnabled || !('Notification' in window)) return;
    const time = settings.dailyNotificationTime || '08:00';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
    const check = () => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const key = `otz_study_notification:${getUid()}`;
      if (`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` < time) return;
      if (localStorage.getItem(key) === today) return;
      try {
        const notice = new Notification('מיים חיים', { body: 'זמן הלימוד היומי שלך הגיע. פתח את המסלולים והמשך בלימוד.', tag: 'daily-study' });
        notice.onclick = () => {
          window.focus();
          setScreen('library');
          notice.close();
        };
        localStorage.setItem(key, today);
      } catch {
        /* browsers can reject notifications in private mode */
      }
    };
    check();
    const interval = window.setInterval(check, 30_000);
    return () => window.clearInterval(interval);
  }, [settings.dailyNotificationsEnabled, settings.dailyNotificationTime, setScreen]);
  return null;
}