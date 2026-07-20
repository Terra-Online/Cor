import { Fragment, useState } from 'react';
import type { ImageCoverageMetric, ImageCoverageRegion, ImageCoverageReport } from './api';

type CoverageRegionFilter = 'all' | 'VL' | 'WL';

type Props = {
  report: ImageCoverageReport | null;
  loading: boolean;
  regionFilter: CoverageRegionFilter;
  onRegionFilterChange: (filter: CoverageRegionFilter) => void;
  onRefresh: () => void;
};

const REGION_FILTERS: { key: CoverageRegionFilter; label: string }[] = [
  { key: 'all', label: 'All regions' },
  { key: 'VL', label: 'Valley IV' },
  { key: 'WL', label: 'Wuling' },
];

export default function ImageCoverageView({
  report,
  loading,
  regionFilter,
  onRegionFilterChange,
  onRefresh,
}: Props) {
  if (loading && !report) {
    return <main className="coverage-view"><div className="empty">Loading image coverage...</div></main>;
  }

  if (!report) {
    return (
      <main className="coverage-view">
        <div className="coverage-empty">
          <strong>Coverage data unavailable</strong>
          <button type="button" onClick={onRefresh}>Retry</button>
        </div>
      </main>
    );
  }

  const visibleRegions = regionFilter === 'all'
    ? report.regions
    : report.regions.filter((region) => region.key === regionFilter);

  return (
    <main className="coverage-view">
      <section className="coverage-toolbar">
        <div>
          <h2>Image Coverage</h2>
          <p>
            Production-visible images across uploadable collection, archive, and exploration markers.
          </p>
        </div>
        <div className="coverage-region-tabs" role="group" aria-label="Coverage region">
          {REGION_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={regionFilter === filter.key ? 'active' : undefined}
              onClick={() => onRegionFilterChange(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="coverage-overview" aria-label="Coverage overview">
        <CoverageSummary label="WL + VL" metric={report.total} prominent />
        {report.regions.map((region) => (
          <CoverageSummary key={region.key} label={`${region.key} · ${region.name}`} metric={region} />
        ))}
      </section>

      {visibleRegions.map((region) => <RegionCoverage key={region.key} region={region} />)}

      <footer className="coverage-meta">
        <span>Calculated {formatTimestamp(report.generatedAt)}</span>
        <span>Atlos {report.manifest.sourceCommit.slice(0, 8)}</span>
        <span>Manifest {formatTimestamp(report.manifest.generatedAt)}</span>
      </footer>
    </main>
  );
}

function CoverageSummary({
  label,
  metric,
  prominent = false,
}: {
  label: string;
  metric: ImageCoverageMetric;
  prominent?: boolean;
}) {
  return (
    <article className={prominent ? 'coverage-summary prominent' : 'coverage-summary'}>
      <span>{label}</span>
      <strong>{formatPercent(metric.coverageRate)}</strong>
      <div className="coverage-progress" aria-hidden="true">
        <span style={{ width: `${clampPercent(metric.coverageRate)}%` }} />
      </div>
      <small>{metric.coveredPoints.toLocaleString()} / {metric.totalPoints.toLocaleString()} points · {metric.missingPoints.toLocaleString()} missing</small>
    </article>
  );
}

function RegionCoverage({ region }: { region: ImageCoverageRegion }) {
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const copyMissingLinks = async (typeKey: string, links: string[]) => {
    try {
      await navigator.clipboard.writeText(links.join('\n'));
      setCopiedType(typeKey);
      window.setTimeout(() => setCopiedType((current) => current === typeKey ? null : current), 1600);
    } catch {
      setCopiedType(null);
    }
  };

  return (
    <section className="coverage-region-section">
      <div className="coverage-region-head">
        <div>
          <h3>{region.key} · {region.name}</h3>
          <p>{region.imageCount.toLocaleString()} visible images across {region.coveredPoints.toLocaleString()} covered points.</p>
        </div>
        <strong>{formatPercent(region.coverageRate)}</strong>
      </div>

      <div className="coverage-categories">
        {region.categories.map((category) => (
          <div key={category.key} className="coverage-category">
            <span>{category.name}</span>
            <strong>{formatPercent(category.coverageRate)}</strong>
            <small>{category.coveredPoints} / {category.totalPoints} · {category.missingPoints} missing</small>
          </div>
        ))}
      </div>

      <div className="coverage-table-wrap">
        <table className="coverage-table">
          <thead>
            <tr>
              <th>Marker type</th>
              <th>Category</th>
              <th className="numeric">Covered</th>
              <th className="numeric">Total</th>
              <th className="numeric">Missing</th>
              <th className="numeric">Images</th>
              <th>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {region.types.map((type) => {
              const expanded = expandedType === type.key;
              return (
                <Fragment key={type.key}>
                  <tr className={type.missingPoints > 0 ? 'has-gap' : undefined}>
                    <td>
                      <strong>{type.name}</strong>
                      <code>{type.key}</code>
                    </td>
                    <td>{categoryLabel(type.category)}</td>
                    <td className="numeric">{type.coveredPoints.toLocaleString()}</td>
                    <td className="numeric">{type.totalPoints.toLocaleString()}</td>
                    <td className="numeric coverage-missing">
                      {type.missingMarkers.length > 0 ? (
                        <button
                          type="button"
                          className="coverage-missing-button"
                          aria-expanded={expanded}
                          onClick={() => setExpandedType(expanded ? null : type.key)}
                        >
                          {type.missingPoints.toLocaleString()}
                          <span aria-hidden="true">{expanded ? '-' : '+'}</span>
                        </button>
                      ) : '0'}
                    </td>
                    <td className="numeric">{type.imageCount.toLocaleString()}</td>
                    <td>
                      <div className="coverage-rate-cell">
                        <div className="coverage-progress" aria-hidden="true">
                          <span style={{ width: `${clampPercent(type.coverageRate)}%` }} />
                        </div>
                        <strong>{formatPercent(type.coverageRate)}</strong>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="coverage-links-row">
                      <td colSpan={7}>
                        <div className="coverage-links-head">
                          <span>{type.missingMarkers.length} points without images</span>
                          <button
                            type="button"
                            onClick={() => void copyMissingLinks(
                              type.key,
                              type.missingMarkers.map((marker) => marker.shortUrl),
                            )}
                          >
                            {copiedType === type.key ? 'Copied' : 'Copy links'}
                          </button>
                        </div>
                        <div className="coverage-links-list">
                          {type.missingMarkers.map((marker) => (
                            <a
                              key={marker.markerId}
                              href={marker.shortUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>{marker.markerId}</span>
                              <code>{marker.shortUrl}</code>
                            </a>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function categoryLabel(category: string): string {
  if (category === 'collection') return 'Collection';
  if (category === 'archives') return 'Archives';
  if (category === 'exploration') return 'Exploration';
  return category;
}

function formatPercent(rate: number): string {
  return `${(Math.max(0, rate) * 100).toFixed(2)}%`;
}

function clampPercent(rate: number): number {
  return Math.min(100, Math.max(0, rate * 100));
}

function formatTimestamp(value: string): string {
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

export type { CoverageRegionFilter };
