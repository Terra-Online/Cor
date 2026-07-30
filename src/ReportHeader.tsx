type ReportSection = 'images' | 'users' | 'translations';

export default function ReportHeader({
  active,
  generatedAt,
}: {
  active: ReportSection;
  generatedAt: string | null;
}) {
  return (
    <header className="report-header">
      <a className="report-brand" href="https://opendfieldmap.org" target="_blank" rel="noreferrer">
        <span>
          <strong>OPEN ENDFIELD MAP</strong>
          <small>TERMINUS TERRAIN ARCHIVE</small>
        </span>
      </a>
      <nav className="report-nav" aria-label="报表页面">
        <a href="/report" aria-current={active === 'images' ? 'page' : undefined}>影像</a>
        <a href="/report/users" aria-current={active === 'users' ? 'page' : undefined}>用户</a>
        <a href="/report/translations" aria-current={active === 'translations' ? 'page' : undefined}>翻译</a>
      </nav>
      <div className="report-data-state">
        <span className="report-live-dot" aria-hidden="true" />
        <span>PROD DATA</span>
        <time dateTime={generatedAt ?? undefined}>
          {generatedAt ? formatShortTime(generatedAt) : 'CONNECTING'}
        </time>
      </div>
    </header>
  );
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
