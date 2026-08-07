import {
  REPORT_LOCALES,
  REPORT_LOCALE_LABELS,
  formatReportDate,
  reportHref,
  useReportLocale,
} from './reportLocale';

type ReportSection = 'images' | 'users' | 'translations';

const HEADER_COPY = {
  'zh-CN': {
    navLabel: '报表页面', images: '影像', users: '用户', translations: '翻译', language: '选择语言', connecting: '连接中',
  },
  'zh-HK': {
    navLabel: '報表頁面', images: '影像', users: '用戶', translations: '翻譯', language: '選擇語言', connecting: '連線中',
  },
  en: {
    navLabel: 'Report pages', images: 'Images', users: 'Users', translations: 'Translations', language: 'Select language', connecting: 'CONNECTING',
  },
} as const;

export default function ReportHeader({
  active,
  generatedAt,
}: {
  active: ReportSection;
  generatedAt: string | null;
}) {
  const { locale, setLocale } = useReportLocale();
  const copy = HEADER_COPY[locale];
  return (
    <header className="report-header">
      <a className="report-brand" href="https://opendfieldmap.org" target="_blank" rel="noreferrer">
        <span>
          <strong>OPEN ENDFIELD MAP</strong>
          <small>TERMINUS TERRAIN ARCHIVE</small>
        </span>
      </a>
      <nav className="report-nav" aria-label={copy.navLabel}>
        <a href={reportHref('/report', locale)} aria-current={active === 'images' ? 'page' : undefined}>{copy.images}</a>
        <a href={reportHref('/report/users', locale)} aria-current={active === 'users' ? 'page' : undefined}>{copy.users}</a>
        <a href={reportHref('/report/translations', locale)} aria-current={active === 'translations' ? 'page' : undefined}>{copy.translations}</a>
      </nav>
      <div className="report-header-tools">
        <label className="report-locale-select">
          <span className="report-visually-hidden">{copy.language}</span>
          <select
            value={locale}
            aria-label={copy.language}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
          >
            {REPORT_LOCALES.map((option) => (
              <option key={option} value={option}>{REPORT_LOCALE_LABELS[locale][option]}</option>
            ))}
          </select>
        </label>
        <div className="report-data-state">
          <span className="report-live-dot" aria-hidden="true" />
          <span>PROD DATA</span>
          <time dateTime={generatedAt ?? undefined}>
            {generatedAt ? formatShortTime(generatedAt, locale) : copy.connecting}
          </time>
        </div>
      </div>
    </header>
  );
}

function formatShortTime(value: string, locale: Parameters<typeof formatReportDate>[1]): string {
  return formatReportDate(value, locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
