export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: string;
  message: string;
  details?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 300;

  constructor() {
    this.addLog('info', 'System', 'מערכת אוצרייה הופעלה בהצלחה');
  }

  public addLog(
    level: 'info' | 'warn' | 'error' | 'success',
    category: string,
    message: string,
    details?: any
  ): LogEntry {
    const timeStr = new Date().toLocaleTimeString('he-IL', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: timeStr,
      level,
      category,
      message,
      details
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Also console log for debugging
    const prefix = `[Otzaria ${category}] ${entry.timestamp}`;
    if (level === 'error') console.error(prefix, message, details || '');
    else if (level === 'warn') console.warn(prefix, message, details || '');
    else console.log(prefix, message, details || '');

    this.notifyListeners();
    return entry;
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const currentLogs = [...this.logs];
    this.listeners.forEach(fn => fn(currentLogs));
  }
}

export const sysLogger = new LoggerService();
