import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  type TranslationReport,
  getTranslationReport,
} from './api';
import ReportHeader from './ReportHeader';
import './report.css';

type TranslationReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TranslationReport };

type TrendRange = '30' | '90' | 'all';
type DailyTranslation = { date: string; count: number };
type ChartStyle = CSSProperties & {
  '--bar-height'?: string;
  '--chart-min-width'?: string;
  '--day-count'?: number;
  '--share-width'?: string;
  '--pie-fill'?: string;
};

const TREND_RANGES: Array<{ value: TrendRange; label: string }> = [
  { value: '30', label: '30 天' },
  { value: '90', label: '90 天' },
  { value: 'all', label: '全部' },
];

const TRANSLATION_COLORS = [
  '#1d48bd',
  '#d96248',
  '#2f7a58',
  '#ffc428',
  '#7b6d8d',
  '#287b8e',
  '#9d3d55',
  '#777777',
  '#47763c',
  '#b16e2f',
  '#455c91',
  '#866a35',
  '#5f4776',
  '#3f7770',
];

export default function TranslationReportPage() {
  const [state, setState] = useState<TranslationReportState>({ status: 'loading' });

  const loadReport = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await getTranslationReport() });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '翻译统计暂时不可用。',
      });
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = '翻译数据报告 | Open Endfield Map';
    document.documentElement.lang = 'zh-CN';
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, []);

  return (
    <div className="report-page translation-report-page" data-state={state.status}>
      <ReportHeader
        active="translations"
        generatedAt={state.status === 'ready' ? state.data.generatedAt : null}
      />
      {state.status === 'loading' && <TranslationReportLoading />}
      {state.status === 'error' && (
        <TranslationReportError message={state.message} onRetry={() => void loadReport()} />
      )}
      {state.status === 'ready' && <TranslationReportContent report={state.data} />}
    </div>
  );
}

function TranslationReportContent({ report }: { report: TranslationReport }) {
  const [range, setRange] = useState<TrendRange>('90');
  const allDaily = useMemo(() => fillDailyTranslations(report.daily), [report.daily]);
  const visibleDaily = useMemo(() => {
    if (range === 'all') return allDaily;
    return allDaily.slice(-Number(range));
  }, [allDaily, range]);
  const latestSevenDays = allDaily.slice(-7).reduce((sum, item) => sum + item.count, 0);

  return (
    <main className="translation-report-main">
      <section className="translation-report-overview">
        <div className="translation-report-title">
          <span>TRANSLATION PERSISTENCE REPORT</span>
          <h1>翻译落库与语言流向</h1>
          <p>{formatReportPeriod(report.firstTranslationDate, report.lastTranslationDate)}</p>
        </div>
        <div className="translation-report-metrics" aria-label="翻译核心数据">
          <ReportMetric label="翻译记录" value={report.totalTranslations} />
          <ReportMetric label="独立原文" value={report.sourceTexts} />
          <ReportMetric label="近 7 天新增" value={latestSevenDays} />
          <ReportMetric label="术语表命中" value={report.glossaryTranslations} />
        </div>
      </section>

      <section className="translation-daily-panel">
        <div className="user-panel-heading">
          <div>
            <span>DAILY PERSISTED TRANSLATIONS</span>
            <h2>新增翻译落库</h2>
          </div>
          <div className="user-range-tabs" role="group" aria-label="翻译趋势时间范围">
            {TREND_RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={range === item.value ? 'active' : ''}
                aria-pressed={range === item.value}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <TranslationTrendChart items={visibleDaily} />
      </section>

      <section className="translation-language-grid">
        <LanguageSharePanel
          eyebrow="SOURCE LANGUAGE SHARE"
          title="源语言占比"
          items={report.sources}
          total={report.totalTranslations}
        />
        <LanguageSharePanel
          eyebrow="TARGET LANGUAGE SHARE"
          title="目标语言占比"
          items={report.targets}
          total={report.totalTranslations}
        />
      </section>

      <section className="translation-flow-panel">
        <div className="user-panel-heading">
          <div>
            <span>LANGUAGE FLOW SHARE</span>
            <h2>翻译流向占比</h2>
          </div>
          <strong>{formatInteger(report.flows.length)} 条流向</strong>
        </div>
        <TranslationFlowChart items={report.flows} total={report.totalTranslations} />
      </section>
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{formatInteger(value)}</strong>
    </div>
  );
}

function TranslationTrendChart({ items }: { items: DailyTranslation[] }) {
  if (items.length === 0) {
    return <div className="translation-chart-empty">暂无翻译落库数据</div>;
  }

  const maximum = Math.max(...items.map((item) => item.count), 1);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const innerStyle = {
    '--chart-min-width': `${Math.max(620, items.length * 8)}px`,
    '--day-count': items.length,
  } as ChartStyle;

  return (
    <div className="translation-trend-chart">
      <div className="user-trend-summary">
        <p><span>范围新增</span><strong>{formatInteger(total)}</strong></p>
        <p><span>单日峰值</span><strong>{formatInteger(maximum)}</strong></p>
      </div>
      <div className="user-trend-body">
        <div className="user-trend-scale" aria-hidden="true">
          <span>{formatInteger(maximum)}</span>
          <span>{formatInteger(Math.round(maximum / 2))}</span>
          <span>0</span>
        </div>
        <div className="user-trend-scroll">
          <div className="user-trend-inner" style={innerStyle}>
            <div className="user-trend-plot">
              <div className="user-trend-grid" aria-hidden="true"><i /><i /><i /></div>
              <div className="user-trend-bars translation-trend-bars">
                {items.map((item) => (
                  <div
                    className="user-trend-bar"
                    key={item.date}
                    title={`${formatFullDate(item.date)} · ${formatInteger(item.count)} 条`}
                    aria-label={`${formatFullDate(item.date)}，新增翻译 ${formatInteger(item.count)} 条`}
                  >
                    <span style={{
                      '--bar-height': `${item.count > 0 ? Math.max(2, (item.count / maximum) * 100) : 0}%`,
                    } as ChartStyle} />
                  </div>
                ))}
              </div>
            </div>
            <div className="user-trend-axis" aria-hidden="true">
              <span>{formatAxisDate(items[0]?.date)}</span>
              <span>{formatAxisDate(items[Math.floor((items.length - 1) / 2)]?.date)}</span>
              <span>{formatAxisDate(items.at(-1)?.date)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LanguageSharePanel({
  eyebrow,
  title,
  items,
  total,
}: {
  eyebrow: string;
  title: string;
  items: TranslationReport['sources'];
  total: number;
}) {
  if (items.length === 0 || total === 0) {
    return (
      <article className="translation-language-panel">
        <div className="user-panel-heading">
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
        </div>
        <div className="translation-chart-empty">暂无语言占比数据</div>
      </article>
    );
  }

  let cursor = 0;
  const segments = items.map((item, index) => {
    const start = cursor;
    const percentage = (item.count / total) * 100;
    cursor += percentage;
    return {
      ...item,
      color: TRANSLATION_COLORS[index % TRANSLATION_COLORS.length],
      percentage,
      start,
      end: cursor,
    };
  });
  const pieFill = `conic-gradient(${segments.map((item) => (
    `${item.color} ${item.start}% ${item.end}%`
  )).join(', ')})`;

  return (
    <article className="translation-language-panel">
      <div className="user-panel-heading">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="translation-language-chart">
        <div
          className="translation-language-pie"
          style={{ '--pie-fill': pieFill } as ChartStyle}
          role="img"
          aria-label={segments.map((item) => (
            `${languageLabel(item.language)} ${item.percentage.toFixed(1)}%`
          )).join('，')}
        >
          <div>
            <strong>{formatInteger(total)}</strong>
            <span>条记录</span>
          </div>
        </div>
        <div className="translation-language-legend">
          {segments.map((item) => (
            <div key={item.language}>
              <i style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span>{languageLabel(item.language)}</span>
              <strong>{formatInteger(item.count)}</strong>
              <small>{item.percentage.toFixed(1)}%</small>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function TranslationFlowChart({
  items,
  total,
}: {
  items: TranslationReport['flows'];
  total: number;
}) {
  if (items.length === 0) {
    return <div className="translation-chart-empty">暂无翻译流向数据</div>;
  }

  return (
    <div className="translation-flow-list">
      {items.map((item) => {
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        const key = `${item.sourceLanguage}-${item.targetLanguage}`;
        return (
          <article className="translation-flow-row" key={key}>
            <div className="translation-flow-label">
              <strong>{languageLabel(item.sourceLanguage)}</strong>
              <span aria-hidden="true">→</span>
              <strong>{languageLabel(item.targetLanguage)}</strong>
            </div>
            <div className="translation-flow-track" aria-hidden="true">
              <span style={{ '--share-width': `${percentage}%` } as ChartStyle} />
            </div>
            <div className="translation-flow-value">
              <strong>{formatInteger(item.count)}</strong>
              <span>{percentage.toFixed(1)}%</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function fillDailyTranslations(rows: DailyTranslation[]): DailyTranslation[] {
  if (rows.length === 0) return [];
  const counts = new Map(rows.map((row) => [row.date, row.count]));
  const firstDate = parseDateKey(rows[0]?.date);
  const lastDataDate = parseDateKey(rows.at(-1)?.date);
  if (!firstDate || !lastDataDate) return rows;

  const today = parseDateKey(new Date().toISOString().slice(0, 10)) ?? lastDataDate;
  const lastDate = lastDataDate.getTime() > today.getTime() ? lastDataDate : today;
  const result: DailyTranslation[] = [];
  for (const date = new Date(firstDate); date <= lastDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

function languageLabel(language: string): string {
  const normalized = language.trim().toLowerCase();
  const labels: Record<string, string> = {
    'zh-cn': '简体中文',
    'zh-tw': '繁体中文',
    'zh-hk': '繁体中文（香港）',
    en: '英语',
    'en-us': '英语',
    ja: '日语',
    'ja-jp': '日语',
    ko: '韩语',
    'ko-kr': '韩语',
    ru: '俄语',
    'ru-ru': '俄语',
    es: '西班牙语',
    de: '德语',
    fr: '法语',
    it: '意大利语',
    pt: '葡萄牙语',
    id: '印度尼西亚语',
    th: '泰语',
    vi: '越南语',
    unknown: '未知',
  };
  const name = labels[normalized] ?? language;
  return `${name} · ${language}`;
}

function parseDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatReportPeriod(first: string | null, last: string | null): string {
  if (!first || !last) return '暂无翻译落库区间';
  return `${formatFullDate(first)} - ${formatFullDate(last)}`;
}

function formatAxisDate(value: string | undefined): string {
  if (!value) return '-';
  return value.slice(5).replace('-', '/');
}

function formatFullDate(value: string): string {
  const date = parseDateKey(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function TranslationReportLoading() {
  return (
    <main className="report-loading" aria-live="polite">
      <div className="report-loader-mark" aria-hidden="true"><span /></div>
      <p>READING TRANSLATION REGISTRY</p>
      <strong>正在汇总翻译落库与语言流向</strong>
      <div className="report-loader-track"><span /></div>
    </main>
  );
}

function TranslationReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="report-error-state">
      <span>DATA LINK / OFFLINE</span>
      <h1>暂时无法读取翻译统计</h1>
      <p>{message}</p>
      <div>
        <button type="button" onClick={onRetry}>重新读取</button>
        <a href="/">前往管理登录</a>
      </div>
    </main>
  );
}
