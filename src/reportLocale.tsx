import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ReportLocale = 'zh-CN' | 'zh-HK' | 'en';

type ReportLocaleContextValue = {
  locale: ReportLocale;
  setLocale: (locale: ReportLocale) => void;
};

const STORAGE_KEY = 'oem-report-locale';

const ReportLocaleContext = createContext<ReportLocaleContextValue | null>(null);

const REPORT_LOCALES: ReportLocale[] = ['zh-CN', 'zh-HK', 'en'];

const REPORT_LOCALE_LABELS: Record<ReportLocale, Record<ReportLocale, string>> = {
  'zh-CN': { 'zh-CN': '简体中文', 'zh-HK': '繁体中文（香港）', en: '英语' },
  'zh-HK': { 'zh-CN': '簡體中文', 'zh-HK': '繁體中文（香港）', en: '英語' },
  en: { 'zh-CN': 'Simplified Chinese', 'zh-HK': 'Traditional Chinese (Hong Kong)', en: 'English' },
};

function ReportLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<ReportLocale>(readInitialLocale);

  const setLocale = useCallback((nextLocale: ReportLocale) => {
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Locale still works for the current page when storage is unavailable.
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get('lang') !== locale) {
      url.searchParams.set('lang', locale);
      window.history.replaceState(window.history.state, '', url);
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <ReportLocaleContext.Provider value={value}>{children}</ReportLocaleContext.Provider>;
}

function useReportLocale(): ReportLocaleContextValue {
  const value = useContext(ReportLocaleContext);
  if (!value) throw new Error('useReportLocale must be used inside ReportLocaleProvider.');
  return value;
}

function readInitialLocale(): ReportLocale {
  const queryLocale = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
  if (queryLocale) return queryLocale;

  try {
    const storedLocale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    if (storedLocale) return storedLocale;
  } catch {
    // Fall through to browser language detection.
  }

  return 'zh-CN';
}

function normalizeLocale(value: string | null | undefined): ReportLocale | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'zh-hk' || normalized === 'zh-tw' || normalized === 'zh-hant') return 'zh-HK';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'zh-cn' || normalized === 'zh' || normalized === 'zh-hans') return 'zh-CN';
  return null;
}

function reportHref(path: string, locale: ReportLocale): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('lang', locale);
  return `${url.pathname}${url.search}`;
}

function formatReportInteger(value: number, locale: ReportLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatReportDate(
  value: string,
  locale: ReportLocale,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export {
  REPORT_LOCALES,
  REPORT_LOCALE_LABELS,
  ReportLocaleProvider,
  formatReportDate,
  formatReportInteger,
  reportHref,
  useReportLocale,
};
export type { ReportLocale };
