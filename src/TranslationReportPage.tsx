import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  type TranslationReport,
  getTranslationReport,
} from './api';
import ReportHeader from './ReportHeader';
import { formatReportInteger, useReportLocale, type ReportLocale } from './reportLocale';
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

const TREND_RANGES: TrendRange[] = ['30', '90', 'all'];

const TRANSLATION_COPY = {
  'zh-CN': {
    title: '翻译数据报告', unavailable: '翻译统计暂时不可用。', heading: '翻译落库与语言流向', metricsLabel: '翻译核心数据', records: '翻译记录', sourceTexts: '独立原文', lastSevenDays: '近 7 天新增', glossary: '术语表命中', daily: '新增翻译落库', rangeLabel: '翻译趋势时间范围', all: '全部', daySuffix: ' 天', sourceShare: '源语言占比', targetShare: '目标语言占比', flowShare: '翻译流向占比', flowUnit: ' 条流向', noDaily: '暂无翻译落库数据', rangeTotal: '范围新增', peak: '单日峰值', recordUnit: ' 条', addedTranslation: '新增翻译', noShare: '暂无语言占比数据', recordLabel: '条记录', noFlows: '暂无翻译流向数据', noPeriod: '暂无翻译落库区间', loading: '正在汇总翻译落库与语言流向', errorTitle: '暂时无法读取翻译统计', retry: '重新读取', admin: '前往管理登录', separator: '，',
  },
  'zh-HK': {
    title: '翻譯數據報告', unavailable: '翻譯統計暫時不可用。', heading: '翻譯入庫與語言流向', metricsLabel: '翻譯核心數據', records: '翻譯記錄', sourceTexts: '獨立原文', lastSevenDays: '近 7 日新增', glossary: '術語表命中', daily: '新增翻譯入庫', rangeLabel: '翻譯趨勢時間範圍', all: '全部', daySuffix: ' 日', sourceShare: '源語言佔比', targetShare: '目標語言佔比', flowShare: '翻譯流向佔比', flowUnit: ' 條流向', noDaily: '暫無翻譯入庫數據', rangeTotal: '範圍新增', peak: '單日高峰', recordUnit: ' 條', addedTranslation: '新增翻譯', noShare: '暫無語言佔比數據', recordLabel: '條記錄', noFlows: '暫無翻譯流向數據', noPeriod: '暫無翻譯入庫期間', loading: '正在匯總翻譯入庫與語言流向', errorTitle: '暫時無法讀取翻譯統計', retry: '重新讀取', admin: '前往管理員登入', separator: '，',
  },
  en: {
    title: 'Translation Data Report', unavailable: 'Translation statistics are temporarily unavailable.', heading: 'Translation Persistence and Language Flows', metricsLabel: 'Key translation metrics', records: 'Translations', sourceTexts: 'Unique source texts', lastSevenDays: 'New in last 7 days', glossary: 'Glossary matches', daily: 'New Persisted Translations', rangeLabel: 'Translation trend range', all: 'All', daySuffix: ' days', sourceShare: 'Source Language Share', targetShare: 'Target Language Share', flowShare: 'Translation Flow Share', flowUnit: ' flows', noDaily: 'No persisted translation data', rangeTotal: 'New in range', peak: 'Daily peak', recordUnit: ' records', addedTranslation: 'New translations', noShare: 'No language share data', recordLabel: 'records', noFlows: 'No translation flow data', noPeriod: 'No translation period available', loading: 'Compiling translation persistence and language flows', errorTitle: 'Unable to load translation statistics', retry: 'Retry', admin: 'Go to admin sign-in', separator: ', ',
  },
} as const;

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
  const { locale } = useReportLocale();
  const copy = TRANSLATION_COPY[locale];
  const [state, setState] = useState<TranslationReportState>({ status: 'loading' });

  const loadReport = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await getTranslationReport() });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '',
      });
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${copy.title} | Open Endfield Map`;
    return () => {
      document.title = previousTitle;
    };
  }, [copy.title]);

  return (
    <div className="report-page translation-report-page" data-state={state.status}>
      <ReportHeader
        active="translations"
        generatedAt={state.status === 'ready' ? state.data.generatedAt : null}
      />
      {state.status === 'loading' && <TranslationReportLoading />}
      {state.status === 'error' && (
        <TranslationReportError message={state.message || copy.unavailable} onRetry={() => void loadReport()} />
      )}
      {state.status === 'ready' && <TranslationReportContent report={state.data} />}
    </div>
  );
}

function TranslationReportContent({ report }: { report: TranslationReport }) {
  const { locale } = useReportLocale();
  const copy = TRANSLATION_COPY[locale];
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
          <h1>{copy.heading}</h1>
          <p>{formatReportPeriod(report.firstTranslationDate, report.lastTranslationDate, locale)}</p>
        </div>
        <div className="translation-report-metrics" aria-label={copy.metricsLabel}>
          <ReportMetric label={copy.records} value={report.totalTranslations} />
          <ReportMetric label={copy.sourceTexts} value={report.sourceTexts} />
          <ReportMetric label={copy.lastSevenDays} value={latestSevenDays} />
          <ReportMetric label={copy.glossary} value={report.glossaryTranslations} />
        </div>
      </section>

      <section className="translation-daily-panel">
        <div className="user-panel-heading">
          <div>
            <span>DAILY PERSISTED TRANSLATIONS</span>
            <h2>{copy.daily}</h2>
          </div>
          <div className="user-range-tabs" role="group" aria-label={copy.rangeLabel}>
            {TREND_RANGES.map((item) => (
              <button
                key={item}
                type="button"
                className={range === item ? 'active' : ''}
                aria-pressed={range === item}
                onClick={() => setRange(item)}
              >
                {item === 'all' ? copy.all : `${item}${copy.daySuffix}`}
              </button>
            ))}
          </div>
        </div>
        <TranslationTrendChart items={visibleDaily} />
      </section>

      <section className="translation-language-grid">
        <LanguageSharePanel
          eyebrow="SOURCE LANGUAGE SHARE"
          title={copy.sourceShare}
          items={report.sources}
          total={report.totalTranslations}
        />
        <LanguageSharePanel
          eyebrow="TARGET LANGUAGE SHARE"
          title={copy.targetShare}
          items={report.targets}
          total={report.totalTranslations}
        />
      </section>

      <section className="translation-flow-panel">
        <div className="user-panel-heading">
          <div>
            <span>LANGUAGE FLOW SHARE</span>
            <h2>{copy.flowShare}</h2>
          </div>
          <strong>{formatReportInteger(report.flows.length, locale)}{copy.flowUnit}</strong>
        </div>
        <TranslationFlowChart items={report.flows} total={report.totalTranslations} />
      </section>
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: number }) {
  const { locale } = useReportLocale();
  return (
    <div>
      <span>{label}</span>
      <strong>{formatReportInteger(value, locale)}</strong>
    </div>
  );
}

function TranslationTrendChart({ items }: { items: DailyTranslation[] }) {
  const { locale } = useReportLocale();
  const copy = TRANSLATION_COPY[locale];
  if (items.length === 0) {
    return <div className="translation-chart-empty">{copy.noDaily}</div>;
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
        <p><span>{copy.rangeTotal}</span><strong>{formatReportInteger(total, locale)}</strong></p>
        <p><span>{copy.peak}</span><strong>{formatReportInteger(maximum, locale)}</strong></p>
      </div>
      <div className="user-trend-body">
        <div className="user-trend-scale" aria-hidden="true">
          <span>{formatReportInteger(maximum, locale)}</span>
          <span>{formatReportInteger(Math.round(maximum / 2), locale)}</span>
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
                    title={`${formatFullDate(item.date, locale)} · ${formatReportInteger(item.count, locale)}${copy.recordUnit}`}
                    aria-label={`${formatFullDate(item.date, locale)}${copy.separator}${copy.addedTranslation} ${formatReportInteger(item.count, locale)}${copy.recordUnit}`}
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
  const { locale } = useReportLocale();
  const copy = TRANSLATION_COPY[locale];
  if (items.length === 0 || total === 0) {
    return (
      <article className="translation-language-panel">
        <div className="user-panel-heading">
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
        </div>
        <div className="translation-chart-empty">{copy.noShare}</div>
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
            `${languageLabel(item.language, locale)} ${item.percentage.toFixed(1)}%`
          )).join(copy.separator)}
        >
          <div>
            <strong>{formatReportInteger(total, locale)}</strong>
            <span>{copy.recordLabel}</span>
          </div>
        </div>
        <div className="translation-language-legend">
          {segments.map((item) => (
            <div key={item.language}>
              <i style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span>{languageLabel(item.language, locale)}</span>
              <strong>{formatReportInteger(item.count, locale)}</strong>
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
  const { locale } = useReportLocale();
  const copy = TRANSLATION_COPY[locale];
  if (items.length === 0) {
    return <div className="translation-chart-empty">{copy.noFlows}</div>;
  }

  return (
    <div className="translation-flow-list">
      {items.map((item) => {
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        const key = `${item.sourceLanguage}-${item.targetLanguage}`;
        return (
          <article className="translation-flow-row" key={key}>
            <div className="translation-flow-label">
              <strong>{languageLabel(item.sourceLanguage, locale)}</strong>
              <span aria-hidden="true">→</span>
              <strong>{languageLabel(item.targetLanguage, locale)}</strong>
            </div>
            <div className="translation-flow-track" aria-hidden="true">
              <span style={{ '--share-width': `${percentage}%` } as ChartStyle} />
            </div>
            <div className="translation-flow-value">
              <strong>{formatReportInteger(item.count, locale)}</strong>
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

function languageLabel(language: string, locale: ReportLocale): string {
  const normalized = language.trim().toLowerCase();
  const labels: Record<ReportLocale, Record<string, string>> = {
    'zh-CN': { 'zh-cn': '简体中文', 'zh-tw': '繁体中文', 'zh-hk': '繁体中文（香港）', en: '英语', 'en-us': '英语', ja: '日语', 'ja-jp': '日语', ko: '韩语', 'ko-kr': '韩语', ru: '俄语', 'ru-ru': '俄语', es: '西班牙语', de: '德语', fr: '法语', it: '意大利语', pt: '葡萄牙语', id: '印度尼西亚语', th: '泰语', vi: '越南语', unknown: '未知' },
    'zh-HK': { 'zh-cn': '簡體中文', 'zh-tw': '繁體中文', 'zh-hk': '繁體中文（香港）', en: '英語', 'en-us': '英語', ja: '日語', 'ja-jp': '日語', ko: '韓語', 'ko-kr': '韓語', ru: '俄語', 'ru-ru': '俄語', es: '西班牙語', de: '德語', fr: '法語', it: '意大利語', pt: '葡萄牙語', id: '印尼語', th: '泰語', vi: '越南語', unknown: '未知' },
    en: { 'zh-cn': 'Simplified Chinese', 'zh-tw': 'Traditional Chinese', 'zh-hk': 'Traditional Chinese (Hong Kong)', en: 'English', 'en-us': 'English', ja: 'Japanese', 'ja-jp': 'Japanese', ko: 'Korean', 'ko-kr': 'Korean', ru: 'Russian', 'ru-ru': 'Russian', es: 'Spanish', de: 'German', fr: 'French', it: 'Italian', pt: 'Portuguese', id: 'Indonesian', th: 'Thai', vi: 'Vietnamese', unknown: 'Unknown' },
  };
  const name = labels[locale][normalized] ?? language;
  return `${name} · ${language}`;
}

function parseDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatReportPeriod(first: string | null, last: string | null, locale: ReportLocale): string {
  if (!first || !last) return TRANSLATION_COPY[locale].noPeriod;
  return `${formatFullDate(first, locale)} - ${formatFullDate(last, locale)}`;
}

function formatAxisDate(value: string | undefined): string {
  if (!value) return '-';
  return value.slice(5).replace('-', '/');
}

function formatFullDate(value: string, locale: ReportLocale): string {
  const date = parseDateKey(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function TranslationReportLoading() {
  const { locale } = useReportLocale();
  return (
    <main className="report-loading" aria-live="polite">
      <div className="report-loader-mark" aria-hidden="true"><span /></div>
      <p>READING TRANSLATION REGISTRY</p>
      <strong>{TRANSLATION_COPY[locale].loading}</strong>
      <div className="report-loader-track"><span /></div>
    </main>
  );
}

function TranslationReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { locale } = useReportLocale();
  const copy = TRANSLATION_COPY[locale];
  return (
    <main className="report-error-state">
      <span>DATA LINK / OFFLINE</span>
      <h1>{copy.errorTitle}</h1>
      <p>{message}</p>
      <div>
        <button type="button" onClick={onRetry}>{copy.retry}</button>
        <a href="/">{copy.admin}</a>
      </div>
    </main>
  );
}
