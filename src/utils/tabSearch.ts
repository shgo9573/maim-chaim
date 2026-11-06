import type { Tab } from '../types';
import type { Language } from '../i18n';

export function tabSearchLabel(tab: Tab, language: Language): string {
  if (tab.kind === 'search') {
    return `${language === 'en' ? 'Search' : 'חיפוש'}${tab.query ? `: ${tab.query}` : ''}`;
  }
  return tab.title;
}

export function filterOpenTabs(tabs: Tab[], query: string, language: Language): Tab[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return tabs;
  return tabs.filter((tab) => tabSearchLabel(tab, language).toLocaleLowerCase().includes(term));
}
