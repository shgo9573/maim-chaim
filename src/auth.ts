import { api, getUid, setUid } from './api';

export interface Account {
  email: string;
  uid: string;
  createdAt: string;
}

const ACCOUNTS_KEY = 'otz_accounts';
const SESSION_KEY = 'otz_session';

interface StoredAccount extends Account {
  hash: string;
  salt: string;
}

function readAccounts(): StoredAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeAccounts(list: StoredAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Deterministic uid from the email, so the same login maps to the same server profile. */
async function uidForEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode('otzaria-user:' + email.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function currentAccount(): Account | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function setSession(acc: Account | null) {
  try {
    if (acc) localStorage.setItem(SESSION_KEY, JSON.stringify(acc));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function register(email: string, password: string): Promise<Account> {
  const mail = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error('כתובת אימייל אינה תקינה');
  if (password.length < 6) throw new Error('הסיסמה חייבת להכיל לפחות 6 תווים');
  const accounts = readAccounts();
  if (accounts.some((a) => a.email === mail)) throw new Error('כבר קיים חשבון עם אימייל זה במכשיר הזה');

  // keep the anonymous data of this browser if it was never linked before
  const existingUid = getUid();
  const linked = accounts.some((a) => a.uid === existingUid);
  const uid = linked ? await uidForEmail(mail) : existingUid;

  const salt = randomSalt();
  const acc: StoredAccount = { email: mail, uid, createdAt: new Date().toISOString(), salt, hash: await hashPassword(password, salt) };
  accounts.push(acc);
  writeAccounts(accounts);
  setUid(uid);
  setSession({ email: mail, uid, createdAt: acc.createdAt });
  try {
    await api.linkEmail(mail);
  } catch {
    /* server may not know this email yet */
  }
  return { email: mail, uid, createdAt: acc.createdAt };
}

export async function login(email: string, password: string): Promise<Account> {
  const mail = email.trim().toLowerCase();
  const accounts = readAccounts();
  const found = accounts.find((a) => a.email === mail);
  if (found) {
    const hash = await hashPassword(password, found.salt);
    if (hash !== found.hash) throw new Error('סיסמה שגויה');
    setUid(found.uid);
    setSession({ email: found.email, uid: found.uid, createdAt: found.createdAt });
    try {
      await api.linkEmail(mail);
    } catch {
      /* ignore */
    }
    return { email: found.email, uid: found.uid, createdAt: found.createdAt };
  }
  // account created on another device – rebuild the deterministic uid
  if (password.length < 6) throw new Error('לא נמצא חשבון במכשיר זה. בדקו את האימייל והסיסמה');
  const uid = await uidForEmail(mail);
  const salt = randomSalt();
  const acc: StoredAccount = { email: mail, uid, createdAt: new Date().toISOString(), salt, hash: await hashPassword(password, salt) };
  accounts.push(acc);
  writeAccounts(accounts);
  setUid(uid);
  setSession({ email: mail, uid, createdAt: acc.createdAt });
  try {
    await api.linkEmail(mail);
  } catch {
    /* ignore */
  }
  return { email: mail, uid, createdAt: acc.createdAt };
}

export function logout() {
  setSession(null);
}

export async function changePassword(email: string, oldPassword: string, newPassword: string): Promise<void> {
  const mail = email.trim().toLowerCase();
  if (newPassword.length < 6) throw new Error('הסיסמה החדשה חייבת להכיל לפחות 6 תווים');
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.email === mail);
  if (idx < 0) throw new Error('החשבון לא נמצא במכשיר זה');
  if ((await hashPassword(oldPassword, accounts[idx].salt)) !== accounts[idx].hash) throw new Error('הסיסמה הנוכחית שגויה');
  const salt = randomSalt();
  accounts[idx] = { ...accounts[idx], salt, hash: await hashPassword(newPassword, salt) };
  writeAccounts(accounts);
}
