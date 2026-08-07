import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  type UserRegistrationReport,
  getUserRegistrationReport,
} from './api';
import ReportHeader from './ReportHeader';
import { formatReportInteger, useReportLocale, type ReportLocale } from './reportLocale';
import './report.css';

type UserReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: UserRegistrationReport };

type TrendRange = '30' | '90' | 'all';
type DailyRegistration = { date: string; count: number };
type ChartStyle = CSSProperties & {
  '--bar-height': string;
  '--chart-min-width'?: string;
  '--day-count'?: number;
  '--pie-fill'?: string;
};

const TREND_RANGES: TrendRange[] = ['30', '90', 'all'];

const USER_COPY = {
  'zh-CN': {
    title: '用户注册报告', unavailable: '用户注册统计暂时不可用。', heading: '用户注册趋势', metricsLabel: '用户注册核心数据', totalUsers: '注册用户', lastSevenDays: '近 7 天新增', today: '今日新增', daily: '逐日注册数量', rangeLabel: '趋势时间范围', all: '全部', daySuffix: ' 天', sourceShare: '注册来源分布', noRegistrations: '暂无注册数据', rangeTotal: '范围合计', peak: '单日峰值', person: ' 人', registered: '注册', noSources: '暂无来源数据', users: '用户', email: '邮箱', unknown: '未知', noPeriod: '暂无注册区间', loading: '正在汇总用户注册数据', errorTitle: '暂时无法读取注册统计', retry: '重新读取', admin: '前往管理登录', separator: '，',
  },
  'zh-HK': {
    title: '用戶註冊報告', unavailable: '用戶註冊統計暫時不可用。', heading: '用戶註冊趨勢', metricsLabel: '用戶註冊核心數據', totalUsers: '註冊用戶', lastSevenDays: '近 7 日新增', today: '今日新增', daily: '每日註冊數量', rangeLabel: '趨勢時間範圍', all: '全部', daySuffix: ' 日', sourceShare: '註冊來源分佈', noRegistrations: '暫無註冊數據', rangeTotal: '範圍合計', peak: '單日高峰', person: ' 人', registered: '註冊', noSources: '暫無來源數據', users: '用戶', email: '電郵', unknown: '未知', noPeriod: '暫無註冊期間', loading: '正在匯總用戶註冊數據', errorTitle: '暫時無法讀取註冊統計', retry: '重新讀取', admin: '前往管理員登入', separator: '，',
  },
  en: {
    title: 'User Registration Report', unavailable: 'User registration statistics are temporarily unavailable.', heading: 'User Registration Trends', metricsLabel: 'Key user registration metrics', totalUsers: 'Registered users', lastSevenDays: 'New in last 7 days', today: 'New today', daily: 'Daily Registrations', rangeLabel: 'Registration trend range', all: 'All', daySuffix: ' days', sourceShare: 'Registration Sources', noRegistrations: 'No registration data', rangeTotal: 'Range total', peak: 'Daily peak', person: ' users', registered: 'Registered', noSources: 'No source data', users: 'Users', email: 'Email', unknown: 'Unknown', noPeriod: 'No registration period available', loading: 'Compiling user registration data', errorTitle: 'Unable to load registration statistics', retry: 'Retry', admin: 'Go to admin sign-in', separator: ', ',
  },
} as const;

const SOURCE_COLORS = ['#d96248', '#1d48bd', '#2f7a58', '#ffc428', '#7b6d8d', '#777'];

export default function UserReportPage() {
  const { locale } = useReportLocale();
  const copy = USER_COPY[locale];
  const [state, setState] = useState<UserReportState>({ status: 'loading' });

  const loadReport = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await getUserRegistrationReport() });
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
    <div className="report-page user-report-page" data-state={state.status}>
      <ReportHeader
        active="users"
        generatedAt={state.status === 'ready' ? state.data.generatedAt : null}
      />
      {state.status === 'loading' && <UserReportLoading />}
      {state.status === 'error' && (
        <UserReportError message={state.message || copy.unavailable} onRetry={() => void loadReport()} />
      )}
      {state.status === 'ready' && <UserReportContent report={state.data} />}
    </div>
  );
}

function UserReportContent({ report }: { report: UserRegistrationReport }) {
  const { locale } = useReportLocale();
  const copy = USER_COPY[locale];
  const [range, setRange] = useState<TrendRange>('90');
  const allDaily = useMemo(() => fillDailyRegistrations(report.daily), [report.daily]);
  const visibleDaily = useMemo(() => {
    if (range === 'all') return allDaily;
    return allDaily.slice(-Number(range));
  }, [allDaily, range]);
  const latestSevenDays = allDaily.slice(-7).reduce((sum, item) => sum + item.count, 0);
  const todayCount = allDaily.at(-1)?.count ?? 0;

  return (
    <main className="user-report-main">
      <section className="user-report-overview">
        <div className="user-report-title">
          <span>USER REGISTRATION REPORT</span>
          <h1>{copy.heading}</h1>
          <p>{formatReportPeriod(report.firstRegistrationDate, report.lastRegistrationDate, locale)}</p>
        </div>
        <div className="user-report-metrics" aria-label={copy.metricsLabel}>
          <ReportMetric label={copy.totalUsers} value={report.totalUsers} />
          <ReportMetric label={copy.lastSevenDays} value={latestSevenDays} />
          <ReportMetric label={copy.today} value={todayCount} />
        </div>
      </section>

      <section className="user-report-grid">
        <article className="user-trend-panel">
          <div className="user-panel-heading">
            <div>
              <span>DAILY REGISTRATIONS</span>
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
          <RegistrationTrendChart items={visibleDaily} />
        </article>

        <article className="user-source-panel">
          <div className="user-panel-heading">
            <div>
              <span>REGISTRATION SOURCE</span>
              <h2>{copy.sourceShare}</h2>
            </div>
          </div>
          <RegistrationSourceChart items={report.sources} totalUsers={report.totalUsers} />
        </article>
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

function RegistrationTrendChart({ items }: { items: DailyRegistration[] }) {
  const { locale } = useReportLocale();
  const copy = USER_COPY[locale];
  if (items.length === 0) {
    return <div className="user-chart-empty">{copy.noRegistrations}</div>;
  }

  const maximum = Math.max(...items.map((item) => item.count), 1);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const innerStyle = {
    '--chart-min-width': `${Math.max(620, items.length * 6)}px`,
    '--day-count': items.length,
  } as ChartStyle;

  return (
    <div className="user-trend-chart">
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
              <div className="user-trend-bars">
                {items.map((item) => (
                  <div
                    className="user-trend-bar"
                    key={item.date}
                    title={`${formatFullDate(item.date, locale)} · ${formatReportInteger(item.count, locale)}${copy.person}`}
                    aria-label={`${formatFullDate(item.date, locale)}${copy.separator}${copy.registered} ${formatReportInteger(item.count, locale)}${copy.person}`}
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

function RegistrationSourceChart({
  items,
  totalUsers,
}: {
  items: UserRegistrationReport['sources'];
  totalUsers: number;
}) {
  const { locale } = useReportLocale();
  const copy = USER_COPY[locale];
  const countedTotal = items.reduce((sum, item) => sum + item.count, 0);
  if (countedTotal === 0) {
    return <div className="user-chart-empty">{copy.noSources}</div>;
  }

  let cursor = 0;
  const segments = items.map((item, index) => {
    const start = cursor;
    const percentage = (item.count / countedTotal) * 100;
    cursor += percentage;
    return {
      ...item,
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
      percentage,
      start,
      end: cursor,
    };
  });
  const pieFill = `conic-gradient(${segments.map((item) => (
    `${item.color} ${item.start}% ${item.end}%`
  )).join(', ')})`;

  return (
    <div className="user-source-chart">
      <div
        className="user-source-pie"
        style={{ '--pie-fill': pieFill } as ChartStyle}
        role="img"
        aria-label={segments.map((item) => (
          `${sourceLabel(item.source, locale)} ${item.percentage.toFixed(1)}%`
        )).join(copy.separator)}
      >
        <div>
          <strong>{formatReportInteger(totalUsers, locale)}</strong>
          <span>{copy.users}</span>
        </div>
      </div>
      <div className="user-source-legend">
        {segments.map((item) => (
          <div key={item.source}>
            <i style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span>{sourceLabel(item.source, locale)}</span>
            <strong>{formatReportInteger(item.count, locale)}</strong>
            <small>{item.percentage.toFixed(1)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function fillDailyRegistrations(rows: DailyRegistration[]): DailyRegistration[] {
  if (rows.length === 0) return [];
  const counts = new Map(rows.map((row) => [row.date, row.count]));
  const firstDate = parseDateKey(rows[0]?.date);
  const lastDataDate = parseDateKey(rows.at(-1)?.date);
  if (!firstDate || !lastDataDate) return rows;

  const today = parseDateKey(new Date().toISOString().slice(0, 10)) ?? lastDataDate;
  const lastDate = lastDataDate.getTime() > today.getTime() ? lastDataDate : today;
  const result: DailyRegistration[] = [];
  for (const date = new Date(firstDate); date <= lastDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

function parseDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function sourceLabel(source: string, locale: ReportLocale): string {
  const copy = USER_COPY[locale];
  const normalized = source.trim().toLowerCase();
  if (['credential', 'email', 'email-password', 'password'].includes(normalized)) return copy.email;
  if (normalized === 'google') return 'Google';
  if (normalized === 'github') return 'GitHub';
  if (normalized === 'discord') return 'Discord';
  if (!normalized || normalized === 'unknown') return copy.unknown;
  return source;
}

function formatReportPeriod(first: string | null, last: string | null, locale: ReportLocale): string {
  if (!first || !last) return USER_COPY[locale].noPeriod;
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

function UserReportLoading() {
  const { locale } = useReportLocale();
  return (
    <main className="report-loading" aria-live="polite">
      <div className="report-loader-mark" aria-hidden="true"><span /></div>
      <p>READING USER REGISTRY</p>
      <strong>{USER_COPY[locale].loading}</strong>
      <div className="report-loader-track"><span /></div>
    </main>
  );
}

function UserReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { locale } = useReportLocale();
  const copy = USER_COPY[locale];
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
