import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  type UserRegistrationReport,
  getUserRegistrationReport,
} from './api';
import ReportHeader from './ReportHeader';
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

const TREND_RANGES: Array<{ value: TrendRange; label: string }> = [
  { value: '30', label: '30 天' },
  { value: '90', label: '90 天' },
  { value: 'all', label: '全部' },
];

const SOURCE_COLORS = ['#d96248', '#1d48bd', '#2f7a58', '#ffc428', '#7b6d8d', '#777'];

export default function UserReportPage() {
  const [state, setState] = useState<UserReportState>({ status: 'loading' });

  const loadReport = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await getUserRegistrationReport() });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '用户注册统计暂时不可用。',
      });
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = '用户注册报告 | Open Endfield Map';
    document.documentElement.lang = 'zh-CN';
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, []);

  return (
    <div className="report-page user-report-page" data-state={state.status}>
      <ReportHeader
        active="users"
        generatedAt={state.status === 'ready' ? state.data.generatedAt : null}
      />
      {state.status === 'loading' && <UserReportLoading />}
      {state.status === 'error' && (
        <UserReportError message={state.message} onRetry={() => void loadReport()} />
      )}
      {state.status === 'ready' && <UserReportContent report={state.data} />}
    </div>
  );
}

function UserReportContent({ report }: { report: UserRegistrationReport }) {
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
          <h1>用户注册趋势</h1>
          <p>{formatReportPeriod(report.firstRegistrationDate, report.lastRegistrationDate)}</p>
        </div>
        <div className="user-report-metrics" aria-label="用户注册核心数据">
          <ReportMetric label="注册用户" value={report.totalUsers} />
          <ReportMetric label="近 7 天新增" value={latestSevenDays} />
          <ReportMetric label="今日新增" value={todayCount} />
        </div>
      </section>

      <section className="user-report-grid">
        <article className="user-trend-panel">
          <div className="user-panel-heading">
            <div>
              <span>DAILY REGISTRATIONS</span>
              <h2>逐日注册数量</h2>
            </div>
            <div className="user-range-tabs" role="group" aria-label="趋势时间范围">
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
          <RegistrationTrendChart items={visibleDaily} />
        </article>

        <article className="user-source-panel">
          <div className="user-panel-heading">
            <div>
              <span>REGISTRATION SOURCE</span>
              <h2>注册来源分布</h2>
            </div>
          </div>
          <RegistrationSourceChart items={report.sources} totalUsers={report.totalUsers} />
        </article>
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

function RegistrationTrendChart({ items }: { items: DailyRegistration[] }) {
  if (items.length === 0) {
    return <div className="user-chart-empty">暂无注册数据</div>;
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
        <p><span>范围合计</span><strong>{formatInteger(total)}</strong></p>
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
              <div className="user-trend-bars">
                {items.map((item) => (
                  <div
                    className="user-trend-bar"
                    key={item.date}
                    title={`${formatFullDate(item.date)} · ${formatInteger(item.count)} 人`}
                    aria-label={`${formatFullDate(item.date)}，注册 ${formatInteger(item.count)} 人`}
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
  const countedTotal = items.reduce((sum, item) => sum + item.count, 0);
  if (countedTotal === 0) {
    return <div className="user-chart-empty">暂无来源数据</div>;
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
          `${sourceLabel(item.source)} ${item.percentage.toFixed(1)}%`
        )).join('，')}
      >
        <div>
          <strong>{formatInteger(totalUsers)}</strong>
          <span>用户</span>
        </div>
      </div>
      <div className="user-source-legend">
        {segments.map((item) => (
          <div key={item.source}>
            <i style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span>{sourceLabel(item.source)}</span>
            <strong>{formatInteger(item.count)}</strong>
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

function sourceLabel(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (['credential', 'email', 'email-password', 'password'].includes(normalized)) return '邮箱';
  if (normalized === 'google') return 'Google';
  if (normalized === 'github') return 'GitHub';
  if (normalized === 'discord') return 'Discord';
  if (!normalized || normalized === 'unknown') return '未知';
  return source;
}

function formatReportPeriod(first: string | null, last: string | null): string {
  if (!first || !last) return '暂无注册区间';
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

function UserReportLoading() {
  return (
    <main className="report-loading" aria-live="polite">
      <div className="report-loader-mark" aria-hidden="true"><span /></div>
      <p>READING USER REGISTRY</p>
      <strong>正在汇总用户注册数据</strong>
      <div className="report-loader-track"><span /></div>
    </main>
  );
}

function UserReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="report-error-state">
      <span>DATA LINK / OFFLINE</span>
      <h1>暂时无法读取注册统计</h1>
      <p>{message}</p>
      <div>
        <button type="button" onClick={onRetry}>重新读取</button>
        <a href="/">前往管理登录</a>
      </div>
    </main>
  );
}
