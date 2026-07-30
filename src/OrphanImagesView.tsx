import type { OrphanImageReport } from './api';

type OrphanImagesViewProps = {
  report: OrphanImageReport | null;
  loading: boolean;
  onRefresh: () => void;
};

export default function OrphanImagesView({ report, loading, onRefresh }: OrphanImagesViewProps) {
  if (loading && !report) {
    return <main className="orphan-view"><div className="empty">Scanning R2 and D1...</div></main>;
  }

  if (!report) {
    return (
      <main className="orphan-view">
        <div className="coverage-empty">
          <strong>Orphan scan unavailable</strong>
          <button type="button" onClick={onRefresh}>Retry</button>
        </div>
      </main>
    );
  }

  return (
    <main className="orphan-view">
      <section className="orphan-toolbar">
        <div>
          <h2>Orphan Images</h2>
          <p>R2 objects without a matching D1 image record.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Scanning...' : 'Scan Again'}
        </button>
      </section>

      <dl className="orphan-stats">
        <div><dt>R2 objects</dt><dd>{report.stats.r2ObjectCount.toLocaleString()}</dd></div>
        <div><dt>D1 references</dt><dd>{report.stats.referencedFileCount.toLocaleString()}</dd></div>
        <div><dt>Orphans</dt><dd>{report.stats.orphanObjectCount.toLocaleString()}</dd></div>
        <div><dt>Orphan size</dt><dd>{formatBytes(report.stats.orphanSizeBytes)}</dd></div>
      </dl>

      {report.items.length === 0 ? (
        <div className="coverage-empty"><strong>No orphan objects found.</strong></div>
      ) : (
        <section className="orphan-grid" aria-label="Orphan image objects">
          {report.items.map((item) => (
            <article key={item.key} className="orphan-item">
              <a href={item.url} target="_blank" rel="noreferrer" className="orphan-preview">
                <img src={item.url} alt="" loading="lazy" />
              </a>
              <div className="orphan-detail">
                <code title={item.key}>{item.key}</code>
                <div className="orphan-meta">
                  <span>{formatBytes(item.sizeBytes)}</span>
                  <span>{item.contentType || item.sourceMimeType || 'unknown type'}</span>
                  <span>{formatTime(item.uploadedAt)}</span>
                </div>
                <div className="orphan-object-meta">
                  <span>{item.storageClass}</span>
                  <span title={item.etag}>ETag {compactEtag(item.etag)}</span>
                  {item.convertedToWebp && <span>Converted WebP</span>}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <footer className="coverage-meta">
        <span>Scanned {formatTime(report.generatedAt)}</span>
        <span>R2 total {formatBytes(report.stats.r2SizeBytes)}</span>
      </footer>
    </main>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function compactEtag(value: string): string {
  const normalized = value.replace(/^"|"$/g, '');
  return normalized.length > 12 ? `${normalized.slice(0, 12)}...` : normalized;
}
