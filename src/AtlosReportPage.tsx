import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  MODERATION_DATE_FETCH_LIMIT,
  type ImageCoverageMetric,
  type ImageCoverageReport,
  type PendingSubmission,
  type ReviewSubmissionStats,
  type UgcLikeReport,
  getImageCoverage,
  getPublicImageUrl,
  getUgcLikeReport,
  listPendingSubmissions,
} from './api';
import ReportHeader from './ReportHeader';
import { reportCategoryAsset, reportItemAsset } from './reportAssets';
import './report.css';

type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ReportModel };

type ReportModel = {
  report: ImageCoverageReport;
  uploadCount: number;
  imageCount: number;
  coverageRate: number;
  coreCoverageRate: number;
  uploadTypes: Array<{ key: string; name: string; count: number }>;
  regions: Array<{ key: string; name: string; metric: ImageCoverageMetric; rate: number }>;
  categories: Array<{ key: string; name: string; metric: ImageCoverageMetric; rate: number }>;
  coreTypes: Array<{ key: string; name: string; metric: ImageCoverageMetric }>;
  otherTypes: Array<{ key: string; name: string; metric: ImageCoverageMetric }>;
  dailyUploads: Array<{ date: string; count: number }>;
  ugcLikes: UgcLikeReport;
  contributors: ContributorStats[];
};

type ContributorStats = {
  userId: string;
  publicUid: string | null;
  nickname: string | null;
  karma: number | null;
  imageCount: number;
  commentCount: number;
  totalCount: number;
  likeCount: number;
};

type ContributorSort = 'contributions' | 'likes' | 'karma';

type ChartStyle = CSSProperties & {
  '--chart-value': string;
  '--chart-delay': string;
};

const UPLOAD_TYPE_ORDER = [
  'gather',
  'aurylene',
  'crate_i',
  'crate_ii',
  'crate_iii',
  'cratesurprise',
  'cratelocked',
  'archives',
] as const;

const CATEGORY_ICONS: Record<string, string> = {
  collection: reportCategoryAsset('collection'),
  archives: reportCategoryAsset('archives'),
  exploration: reportCategoryAsset('exploration'),
};

const TYPE_NAMES: Record<string, string> = {
  aurylene: '醚质',
  crate_i: '初级储藏箱',
  crate_ii: '中级储藏箱',
  crate_iii: '高级储藏箱',
  cratesurprise: '惊喜储藏箱',
  cratelocked: '上锁储藏箱',
  gather: '采集点',
  archives: '档案',
  wooden_box: '木箱',
  guiding_butterflies: '引路蝴蝶',
  pressure_plate: '压力板',
  aero_salvage: '浮空回收',
};

const TYPE_ICONS: Record<string, string> = {
  aurylene: reportItemAsset('aurylene'),
  crate_i: reportItemAsset('crate_i'),
  crate_ii: reportItemAsset('crate_ii'),
  crate_iii: reportItemAsset('crate_iii'),
  cratesurprise: reportItemAsset('cratesurprise'),
  cratelocked: reportItemAsset('cratelocked'),
  gather: reportItemAsset('gather'),
  archives: reportItemAsset('exbook'),
};

let activeReportScrollFrame = 0;

export default function AtlosReportPage() {
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const loadReport = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [report, submissions, ugcLikes] = await Promise.all([
        getImageCoverage(),
        listPendingSubmissions({
          limit: MODERATION_DATE_FETCH_LIMIT,
        }),
        getUgcLikeReport(),
      ]);
      setState({
        status: 'ready',
        data: buildReportModel(report, submissions.items, submissions.stats, ugcLikes),
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '生产统计暂时不可用。',
      });
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = '地图集影像计划 | Open Endfield Map';
    document.documentElement.lang = 'zh-CN';
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, []);

  return (
    <div className="report-page" data-state={state.status}>
      <ReportHeader
        active="images"
        generatedAt={state.status === 'ready' ? state.data.report.generatedAt : null}
      />
      {state.status === 'loading' && <ReportLoading />}
      {state.status === 'error' && (
        <ReportError message={state.message} onRetry={() => void loadReport()} />
      )}
      {state.status === 'ready' && <ReportContent model={state.data} />}
    </div>
  );
}

function ReportContent({ model }: { model: ReportModel }) {
  const [detailRef, detailVisible] = useInView<HTMLElement>();
  const [uploadsRef, uploadsVisible] = useInView<HTMLElement>();
  const [likesRef, likesVisible] = useInView<HTMLElement>();
  const [contributorsRef, contributorsVisible] = useInView<HTMLElement>();

  return (
    <main className="report-main">
      <section
        className="report-hero report-click-page"
        onClick={() => scrollToReportSection(detailRef.current)}
      >
        <div className="report-hero-copy">
          <h1>OPEN ENDFIELD MAP<small>地图集影像计划</small></h1>
        </div>

        <div className="report-primary-metrics" aria-label="影像计划核心数据">
          <Metric
            label="三个月新增截图"
            value={model.uploadCount}
          />
          <Metric
            label="收集物点位覆盖"
            value={model.coverageRate * 100}
            decimals={1}
            suffix="%"
          />
          <Metric
            label="核心类型覆盖"
            value={model.coreCoverageRate * 100}
            decimals={1}
            suffix="%"
          />
        </div>
        <TotalComparison
          active
          imageCount={model.imageCount}
          pointCount={model.report.total.totalPoints}
        />
        <RegionCoverage model={model} />
      </section>

      <section
        ref={detailRef}
        className="report-band report-detail-band report-click-page"
        data-visible={detailVisible}
        onClick={() => scrollToReportSection(uploadsRef.current)}
      >
        <div className="report-detail-layout">
          <div>
            <SectionHeading eyebrow="CORE TYPE COVERAGE" title="核心类型覆盖" />
            <div className="report-core-list">
              {model.coreTypes.map((item, index) => {
                const coverageRate = Math.min(100, Math.max(0, item.metric.coverageRate * 100));
                const imageRate = item.metric.totalPoints > 0
                  ? (item.metric.imageCount / item.metric.totalPoints) * 100
                  : 0;
                return (
                  <article className="report-core-row" key={item.key}>
                    <div className="report-core-copy">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{item.name}</strong>
                      <small>{formatInteger(item.metric.imageCount)} 张 / {formatInteger(item.metric.totalPoints)} 点位</small>
                    </div>
                    <div className="report-core-progress" aria-label={`${item.name} ${coverageRate.toFixed(1)}%，图片点位比 ${imageRate.toFixed(0)}%`}>
                      <span style={{
                        '--chart-value': `${coverageRate}%`,
                        '--chart-delay': `${index * 110}ms`,
                      } as ChartStyle} />
                    </div>
                    <b>
                      <AnimatedNumber active={detailVisible} value={coverageRate} decimals={1} />%
                      <small>（<AnimatedNumber active={detailVisible} value={imageRate} />%）</small>
                    </b>
                  </article>
                );
              })}
            </div>
            {model.otherTypes.length > 0 && (
              <div className="report-other-coverage">
                <div className="report-other-heading">
                  <span>OTHER TYPE COVERAGE</span>
                  <h3>其余类型覆盖</h3>
                </div>
                <div className="report-other-grid">
                  {model.otherTypes.map((item, index) => {
                    const coverageRate = Math.min(100, Math.max(0, item.metric.coverageRate * 100));
                    return (
                      <article className="report-other-row" key={item.key}>
                        <div className="report-other-copy">
                          <strong>{item.name}</strong>
                          <small>{formatInteger(item.metric.imageCount)} 张 / {formatInteger(item.metric.totalPoints)} 点位</small>
                        </div>
                        <div className="report-other-progress" aria-label={`${item.name} ${coverageRate.toFixed(1)}%`}>
                          <span style={{
                            '--chart-value': `${coverageRate}%`,
                            '--chart-delay': `${index * 90 + 360}ms`,
                          } as ChartStyle} />
                        </div>
                        <b><AnimatedNumber active={detailVisible} value={coverageRate} decimals={1} />%</b>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="report-category-panel">
            <p className="report-panel-label report-category-label">
              <span>CATEGORY COVERAGE</span>
              <strong>分类覆盖率</strong>
            </p>
            {model.categories.map((category, index) => (
              <article className="report-category-row" key={category.key}>
                <img src={CATEGORY_ICONS[category.key] ?? reportCategoryAsset('collection')} alt="" />
                <div>
                  <div className="report-category-copy">
                    <strong>{category.name}</strong>
                    <span><AnimatedNumber active={detailVisible} value={category.rate * 100} decimals={1} />%</span>
                  </div>
                  <div className="report-horizontal-track">
                    <span style={{
                      '--chart-value': `${category.rate * 100}%`,
                      '--chart-delay': `${index * 130}ms`,
                    } as ChartStyle} />
                  </div>
                  <small>{formatInteger(category.metric.coveredPoints)} / {formatInteger(category.metric.totalPoints)} POINTS</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={uploadsRef}
        className="report-band report-uploads-band report-click-page"
        data-visible={uploadsVisible}
        onClick={() => scrollToReportSection(likesRef.current)}
      >
        <div className="report-upload-types-section">
          <SectionHeading eyebrow="TYPE IMAGE TOTAL" title="类型影像总量" />
          <UploadChart active={uploadsVisible} items={model.uploadTypes} />
        </div>
        <DailyUploadChart active={uploadsVisible} items={model.dailyUploads} />
      </section>

      <UgcLikeSection
        sectionRef={likesRef}
        active={likesVisible}
        report={model.ugcLikes}
      />

      <ContributorSection
        sectionRef={contributorsRef}
        active={contributorsVisible}
        contributors={model.contributors}
      />
    </main>
  );
}

function Metric({
  label,
  value,
  decimals = 0,
  suffix,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <article className="report-metric">
      <p>{label}</p>
      <strong>
        <AnimatedNumber value={value} decimals={decimals} />
        {suffix && <small>{suffix}</small>}
      </strong>
    </article>
  );
}

function SectionHeading({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div className="report-section-heading">
      {eyebrow && <span>{eyebrow}</span>}
      <h2>{title}</h2>
    </div>
  );
}

function scrollToReportSection(target: HTMLElement | null) {
  if (!target) return;

  window.cancelAnimationFrame(activeReportScrollFrame);
  const root = document.documentElement;
  const destination = Math.min(
    window.scrollY + target.getBoundingClientRect().top,
    root.scrollHeight - window.innerHeight,
  );

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, destination);
    return;
  }

  const origin = window.scrollY;
  const distance = destination - origin;
  const startedAt = performance.now();
  root.classList.add('report-scroll-running');

  const animate = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / 1200);
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    window.scrollTo(0, origin + distance * eased);

    if (progress < 1) {
      activeReportScrollFrame = window.requestAnimationFrame(animate);
      return;
    }

    root.classList.remove('report-scroll-running');
    activeReportScrollFrame = 0;
  };

  activeReportScrollFrame = window.requestAnimationFrame(animate);
}

function RegionCoverage({ model }: { model: ReportModel }) {
  const regions = [...model.regions]
    .sort((left, right) => regionOrder(left) - regionOrder(right))
    .slice(0, 2);
  const items = [
    ...regions.map((region) => ({
      key: region.key,
      name: region.name,
      coveredPoints: region.metric.coveredPoints,
      totalPoints: region.metric.totalPoints,
      rate: region.rate,
      aggregate: false,
    })),
    {
      key: 'all',
      name: '总收集率',
      coveredPoints: model.report.total.coveredPoints,
      totalPoints: model.report.total.totalPoints,
      rate: model.coverageRate,
      aggregate: true,
    },
  ];

  return (
    <div className="report-hero-coverage" aria-label="区域覆盖率对比">
      <div className="report-coverage-heading">
        <div>
          <span>REGION COVERAGE</span>
          <h2>区域覆盖率</h2>
        </div>
      </div>
      <div className="report-region-rows">
        {items.map((item, index) => (
          <article className={`report-region-row${item.aggregate ? ' aggregate' : ''}`} key={item.key}>
            <div className="report-region-label">
              <strong>{item.name}</strong>
              <span>{formatInteger(item.coveredPoints)} / {formatInteger(item.totalPoints)}</span>
            </div>
            <div className="report-region-track">
              <span style={{
                '--chart-value': `${regionVisualWidth(item.rate)}%`,
                '--chart-delay': `${index * 120 + 260}ms`,
              } as ChartStyle} />
            </div>
            <div className="report-region-value">
              <AnimatedNumber value={item.rate * 100} decimals={1} /><span>%</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function regionVisualWidth(rate: number): number {
  return Math.min(100, Math.max(0, rate * 100));
}

function regionOrder(region: ReportModel['regions'][number]): number {
  const identity = `${region.key} ${region.name}`.toLowerCase();
  if (identity.includes('武陵') || identity.includes('wuling')) return 0;
  if (identity.includes('谷地') || identity.includes('valley')) return 1;
  return 2;
}

function TotalComparison({
  active,
  imageCount,
  pointCount,
}: {
  active: boolean;
  imageCount: number;
  pointCount: number;
}) {
  const maximum = Math.max(imageCount, pointCount, 1);
  const ratio = pointCount > 0 ? imageCount / pointCount : 0;
  const items = [
    { key: 'images', label: '图片总量', value: imageCount },
    { key: 'points', label: '点位总量', value: pointCount },
  ];

  return (
    <div className="report-total-comparison" aria-label="图片总量与点位总量比较">
      <p className="report-panel-label">
        <span>TOTAL IMAGE / POINT</span>
        <strong>图片/点位量</strong>
      </p>
      {items.map((item, index) => (
        <div className={`report-comparison-row ${item.key}`} key={item.key}>
          <div>
            <span>{item.label}</span>
            <strong><AnimatedNumber active={active} value={item.value} /></strong>
          </div>
          <div className="report-comparison-track">
            <span style={{
              '--chart-value': `${Math.max(8, (item.value / maximum) * 100)}%`,
              '--chart-delay': `${index * 140}ms`,
            } as ChartStyle} />
          </div>
        </div>
      ))}
      <div className="report-comparison-ratio">
        <strong><AnimatedNumber active={active} value={ratio} decimals={2} /></strong>
        <span>张图片 / 点位</span>
      </div>
    </div>
  );
}

function UploadChart({ active, items }: { active: boolean; items: ReportModel['uploadTypes'] }) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  if (items.length === 0) {
    return <div className="report-chart-empty">本周期暂无可展示的上传分类。</div>;
  }

  return (
    <div className="report-upload-type-grid" aria-label="八类影像数量对比">
      {items.map((item, index) => {
        const width = item.count > 0 ? Math.max(8, (item.count / maximum) * 100) : 0;
        return (
          <article
            className="report-upload-type-row"
            key={item.key}
            aria-label={`${item.name}，${formatInteger(item.count)} 张`}
          >
            <img src={TYPE_ICONS[item.key]} alt="" title={item.name} />
            <div className="report-upload-type-track">
              <span style={{
                '--chart-value': `${width}%`,
                '--chart-delay': `${index * 70}ms`,
              } as ChartStyle} />
            </div>
            <strong><AnimatedNumber active={active} value={item.count} /></strong>
          </article>
        );
      })}
    </div>
  );
}

function DailyUploadChart({ active, items }: {
  active: boolean;
  items: ReportModel['dailyUploads'];
}) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const average = items.length > 0 ? total / items.length : 0;

  return (
    <div className="report-daily-section">
      <div className="report-daily-heading">
        <div>
          <span>90 DAY UPLOAD ACTIVITY</span>
          <h2>每日上传数量</h2>
        </div>
        <div className="report-daily-summary" aria-label="九十天上传统计">
          <p><span>合计</span><strong><AnimatedNumber active={active} value={total} /></strong></p>
          <p><span>日均</span><strong><AnimatedNumber active={active} value={average} decimals={1} /></strong></p>
          <p><span>峰值</span><strong><AnimatedNumber active={active} value={maximum} /></strong></p>
        </div>
      </div>
      <div className="report-daily-chart" aria-label="最近九十天每日图片上传柱状图">
        {items.map((item, index) => {
          const height = item.count > 0 ? Math.max(3, (item.count / maximum) * 100) : 0;
          return (
            <div
              className={`report-daily-bar${isRedUploadDay(item.date) ? ' is-red-day' : ''}`}
              key={item.date}
              title={`${formatChartDate(item.date)} · ${formatInteger(item.count)} 张`}
              aria-label={`${formatChartDate(item.date)}，${formatInteger(item.count)} 张`}
            >
              <span style={{
                '--chart-value': `${height}%`,
                '--chart-delay': `${index * 12}ms`,
              } as ChartStyle} />
            </div>
          );
        })}
      </div>
      <div className="report-daily-axis" aria-hidden="true">
        <span>{formatChartDate(items[0]?.date ?? '')}</span>
        <span>90 DAYS</span>
        <span>{formatChartDate(items.at(-1)?.date ?? '')}</span>
      </div>
    </div>
  );
}

function UgcLikeSection({
  sectionRef,
  active,
  report,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  active: boolean;
  report: UgcLikeReport;
}) {
  const daily = fillDailyUgcLikes(report.daily).slice(-90);
  const maximum = Math.max(...daily.map((item) => item.imageLikes + item.commentLikes), 1);
  const recentTotal = daily.reduce(
    (sum, item) => sum + item.imageLikes + item.commentLikes,
    0,
  );
  const mix = [
    { key: 'images', label: '图片点赞', value: report.imageLikes },
    { key: 'comments', label: '评论点赞', value: report.commentLikes },
    { key: 'dislikes', label: '评论点踩', value: report.commentDislikes },
  ];
  const mixMaximum = Math.max(...mix.map((item) => item.value), 1);

  return (
    <section
      ref={sectionRef}
      className="report-band report-likes-band"
      data-visible={active}
    >
      <div className="report-likes-heading">
        <div>
          <span>UGC REACTION SIGNAL</span>
          <h2>UGC 点赞情况</h2>
          <p>{formatDatePeriod(report.firstReactionDate, report.lastReactionDate)}</p>
        </div>
        <div className="report-likes-metrics" aria-label="UGC 点赞核心数据">
          <Metric label="当前有效点赞" value={report.totalLikes} />
          <Metric label="获赞 UGC" value={report.likedSubmissions} />
          <Metric label="参与用户" value={report.uniqueReactors} />
          <Metric label="评论点踩" value={report.commentDislikes} />
        </div>
      </div>

      <div className="report-likes-grid">
        <div className="report-likes-trend">
          <div className="report-likes-panel-heading">
            <div>
              <span>90 DAY LIKE ACTIVITY</span>
              <h3>每日有效点赞</h3>
            </div>
            <div>
              <span>90 天合计</span>
              <strong><AnimatedNumber active={active} value={recentTotal} /></strong>
            </div>
          </div>
          <div className="report-like-chart" aria-label="最近九十天图片与评论有效点赞数量">
            {daily.map((item, index) => {
              const count = item.imageLikes + item.commentLikes;
              const height = count > 0 ? Math.max(3, (count / maximum) * 100) : 0;
              return (
                <div
                  className="report-like-daily-bar"
                  key={item.date}
                  title={`${formatChartDate(item.date)} · 图片 ${formatInteger(item.imageLikes)} / 评论 ${formatInteger(item.commentLikes)}`}
                  aria-label={`${formatChartDate(item.date)}，图片点赞 ${formatInteger(item.imageLikes)}，评论点赞 ${formatInteger(item.commentLikes)}`}
                >
                  <span style={{
                    '--chart-value': `${height}%`,
                    '--chart-delay': `${index * 10}ms`,
                  } as ChartStyle} />
                </div>
              );
            })}
          </div>
          <div className="report-daily-axis" aria-hidden="true">
            <span>{formatChartDate(daily[0]?.date ?? '')}</span>
            <span>90 DAYS</span>
            <span>{formatChartDate(daily.at(-1)?.date ?? '')}</span>
          </div>
        </div>

        <div className="report-likes-side">
          <MostLikedImage image={report.topImage} />
          <div className="report-like-mix">
            <div className="report-likes-panel-heading">
              <div>
                <span>CURRENT REACTION MIX</span>
                <h3>反馈构成</h3>
              </div>
            </div>
            <div className="report-like-mix-list">
              {mix.map((item, index) => (
                <article className={`report-like-mix-row ${item.key}`} key={item.key}>
                  <div>
                    <span>{item.label}</span>
                    <strong><AnimatedNumber active={active} value={item.value} /></strong>
                  </div>
                  <div className="report-like-mix-track">
                    <span style={{
                      '--chart-value': `${item.value > 0 ? Math.max(2, (item.value / mixMaximum) * 100) : 0}%`,
                      '--chart-delay': `${index * 140}ms`,
                    } as ChartStyle} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MostLikedImage({ image }: { image: UgcLikeReport['topImage'] }) {
  return (
    <div className="report-popular-image">
      <div className="report-likes-panel-heading">
        <div>
          <span>MOST LIKED IMAGE</span>
          <h3>最受欢迎图片</h3>
        </div>
      </div>
      {image ? (
        <a
          className="report-popular-image-link"
          href={image.pointUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`在地图中查看最受欢迎图片，${formatInteger(image.likeCount)} 个赞`}
        >
          <span className="report-popular-image-media">
            <img
              src={getPublicImageUrl(image.filePath)}
              alt={`${displayPoiType(image.poiType)}点位的用户图片`}
            />
          </span>
          <span className="report-popular-image-meta">
            <span>
              <strong>{displayPoiType(image.poiType)}</strong>
              <small>POINT {image.markerId}</small>
            </span>
            <span>
              <strong>{formatInteger(image.likeCount)}</strong>
              <small>点赞</small>
            </span>
          </span>
          <span className="report-popular-image-action">查看地图点位</span>
        </a>
      ) : (
        <div className="report-popular-image-empty">暂无公开图片点赞数据</div>
      )}
    </div>
  );
}

function ContributorSection({
  sectionRef,
  active,
  contributors,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  active: boolean;
  contributors: ContributorStats[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<ContributorSort>('contributions');
  const sortedContributors = useMemo(
    () => sortContributorStats(contributors, sort),
    [contributors, sort],
  );
  const topContributors = sortedContributors.slice(0, 10);
  const totalContributions = contributors.reduce((sum, item) => sum + item.totalCount, 0);
  const maximum = Math.max(...topContributors.map((item) => item.totalCount), 1);
  const average = contributors.length > 0 ? totalContributions / contributors.length : 0;

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.documentElement.classList.add('report-dialog-open');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.classList.remove('report-dialog-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  return (
    <section
      ref={sectionRef}
      className="report-band report-contributors-band"
      data-visible={active}
    >
      <div className="report-contributors-heading">
        <div>
          <span>UGC CONTRIBUTOR RANKING</span>
          <h2>最活跃贡献者</h2>
          <p>{contributorSortDescription(sort)}</p>
          <ContributorSortControl value={sort} onChange={setSort} />
        </div>
        <div className="report-contributors-summary" aria-label="贡献者统计概览">
          <p><span>贡献者</span><strong><AnimatedNumber active={active} value={contributors.length} /></strong></p>
          <p><span>UGC 提交</span><strong><AnimatedNumber active={active} value={totalContributions} /></strong></p>
          <p><span>人均贡献</span><strong><AnimatedNumber active={active} value={average} decimals={1} /></strong></p>
        </div>
      </div>

      <div className="report-contributor-list" aria-label="最活跃的十名贡献者">
        <div className="report-contributor-columns" aria-hidden="true">
          <span>排名 / 用户名 / OEM ID</span>
          <span>KARMA</span>
          <span>图片 / 评论</span>
          <span>获赞</span>
          <span>贡献量</span>
        </div>
        {topContributors.map((contributor, index) => (
          <button
            type="button"
            className="report-contributor-row"
            key={contributor.userId}
            onClick={() => setExpanded(true)}
          >
            <span className="report-contributor-identity">
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>
                <strong>{contributorUsername(contributor)}</strong>
                <small>OEM {contributorOemId(contributor)}</small>
              </span>
            </span>
            <strong
              className="report-contributor-karma"
              aria-label={`Karma ${contributor.karma === null ? '未知' : formatInteger(contributor.karma)}`}
            >
              {contributor.karma === null ? '-' : formatInteger(contributor.karma)}
            </strong>
            <span className="report-contributor-split">
              <b><small>图片</small>{formatInteger(contributor.imageCount)}</b>
              <i>/</i>
              <b><small>评论</small>{formatInteger(contributor.commentCount)}</b>
            </span>
            <strong
              className="report-contributor-likes"
              aria-label={`获赞 ${formatInteger(contributor.likeCount)}`}
            >
              {formatInteger(contributor.likeCount)}
            </strong>
            <span className="report-contributor-total" aria-label={`总贡献 ${formatInteger(contributor.totalCount)}`}>
              <span aria-hidden="true">
                <i style={{
                  '--chart-value': `${Math.max(4, (contributor.totalCount / maximum) * 100)}%`,
                  '--chart-delay': `${index * 75}ms`,
                } as ChartStyle} />
              </span>
              <strong><AnimatedNumber active={active} value={contributor.totalCount} /></strong>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="report-contributors-expand"
        onClick={() => setExpanded(true)}
      >
        查看全部 {formatInteger(contributors.length)} 名贡献者
      </button>

      {expanded && (
        <ContributorDialog
          contributors={sortedContributors}
          sort={sort}
          onSortChange={setSort}
          onClose={() => setExpanded(false)}
        />
      )}
    </section>
  );
}

function ContributorDialog({
  contributors,
  sort,
  onSortChange,
  onClose,
}: {
  contributors: ContributorStats[];
  sort: ContributorSort;
  onSortChange: (sort: ContributorSort) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="report-contributor-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="report-contributor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contributor-dialog-title"
      >
        <header>
          <div>
            <span>FULL CONTRIBUTOR STATISTICS</span>
            <h2 id="contributor-dialog-title">完整贡献者统计</h2>
          </div>
          <ContributorSortControl value={sort} onChange={onSortChange} compact />
          <button type="button" onClick={onClose} aria-label="关闭完整贡献者统计" autoFocus>×</button>
        </header>
        <div className="report-contributor-table-wrap">
          <table className="report-contributor-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>用户名</th>
                <th>OEM ID</th>
                <th>Karma</th>
                <th>图片</th>
                <th>评论</th>
                <th>获赞</th>
                <th>总贡献</th>
              </tr>
            </thead>
            <tbody>
              {contributors.map((contributor, index) => (
                <tr key={contributor.userId}>
                  <td>{index + 1}</td>
                  <td><strong>{contributorUsername(contributor)}</strong></td>
                  <td>{contributorOemId(contributor)}</td>
                  <td>{contributor.karma === null ? '-' : formatInteger(contributor.karma)}</td>
                  <td>{formatInteger(contributor.imageCount)}</td>
                  <td>{formatInteger(contributor.commentCount)}</td>
                  <td><strong>{formatInteger(contributor.likeCount)}</strong></td>
                  <td><strong>{formatInteger(contributor.totalCount)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ContributorSortControl({
  value,
  onChange,
  compact = false,
}: {
  value: ContributorSort;
  onChange: (sort: ContributorSort) => void;
  compact?: boolean;
}) {
  const options: Array<{ value: ContributorSort; label: string }> = [
    { value: 'contributions', label: '贡献量' },
    { value: 'likes', label: '获赞' },
    { value: 'karma', label: 'Karma' },
  ];

  return (
    <div className="report-contributor-sort" data-compact={compact || undefined}>
      <span>排序</span>
      <div role="group" aria-label="贡献者排序方式">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function contributorSortDescription(sort: ContributorSort): string {
  if (sort === 'likes') return '按图片与评论收到的点赞总量排序';
  if (sort === 'karma') return '按当前 Karma 分数排序';
  return '按图片与评论提交总量排序';
}

function sortContributorStats(
  contributors: ContributorStats[],
  sort: ContributorSort,
): ContributorStats[] {
  return [...contributors].sort((left, right) => {
    const contributionDifference = right.totalCount - left.totalCount;
    const likeDifference = right.likeCount - left.likeCount;
    const karmaDifference = compareNullableNumbersDescending(left.karma, right.karma);

    const metricDifference = sort === 'likes'
      ? likeDifference || contributionDifference || karmaDifference
      : sort === 'karma'
        ? karmaDifference || contributionDifference || likeDifference
        : contributionDifference || likeDifference || karmaDifference;

    return metricDifference
      || contributorUsername(left).localeCompare(contributorUsername(right), 'zh-CN')
      || left.userId.localeCompare(right.userId);
  });
}

function compareNullableNumbersDescending(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function contributorUsername(contributor: ContributorStats): string {
  return contributor.nickname?.trim() || '未设置用户名';
}

function contributorOemId(contributor: ContributorStats): string {
  return contributor.publicUid?.trim() || '未分配';
}

function displayPoiType(value: string): string {
  const key = canonicalUploadTypeKey(value);
  return TYPE_NAMES[key] ?? value.replace(/[_-]+/g, ' ');
}

function fillDailyUgcLikes(rows: UgcLikeReport['daily']): UgcLikeReport['daily'] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: 90 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - (89 - index));
    const key = date.toISOString().slice(0, 10);
    return byDate.get(key) ?? {
      date: key,
      imageLikes: 0,
      commentLikes: 0,
      commentDislikes: 0,
    };
  });
}

function formatDatePeriod(first: string | null, last: string | null): string {
  if (!first || !last) return '暂无互动区间';
  return `${formatChartDate(first)} - ${formatChartDate(last)}`;
}

function AnimatedNumber({
  active = true,
  value,
  decimals = 0,
}: {
  active?: boolean;
  value: number;
  decimals?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const formatter = useMemo(() => new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }), [decimals]);

  useEffect(() => {
    if (!active) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(value);
      return undefined;
    }

    const startedAt = performance.now();
    let animationFrame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 1450);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(value * eased);
      if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, value]);

  return <>{formatter.format(displayValue)}</>;
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.12,
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, visible] as const;
}

function ReportLoading() {
  return (
    <main className="report-loading" aria-live="polite">
      <div className="report-loader-mark" aria-hidden="true"><span /></div>
      <p>CONNECTING TO TERRAIN ARCHIVE</p>
      <strong>正在汇总生产环境影像数据</strong>
      <div className="report-loader-track"><span /></div>
    </main>
  );
}

function ReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="report-error-state">
      <span>DATA LINK / OFFLINE</span>
      <h1>暂时无法读取影像统计</h1>
      <p>{message}</p>
      <div>
        <button type="button" onClick={onRetry}>重新读取</button>
        <a href="/">前往管理登录</a>
      </div>
    </main>
  );
}

function buildReportModel(
  report: ImageCoverageReport,
  submissions: PendingSubmission[],
  stats: ReviewSubmissionStats | null,
  ugcLikes: UgcLikeReport,
): ReportModel {
  const imageSubmissions = submissions.filter((submission) => submission.kind === 'image');
  const imageCount = stats?.byKind?.find((entry) => entry.kind === 'image')?.count
    ?? imageSubmissions.length;
  const dailyUploads = buildDailyUploadCounts(imageSubmissions);
  const recentImageCount = dailyUploads.reduce((sum, item) => sum + item.count, 0);
  const uploadTypeCounts = new Map<string, number>();
  for (const submission of imageSubmissions) {
    const key = canonicalUploadTypeKey(submission.poiType);
    uploadTypeCounts.set(key, (uploadTypeCounts.get(key) ?? 0) + 1);
  }

  const uploadTypes = UPLOAD_TYPE_ORDER.map((key) => ({
    key,
    name: TYPE_NAMES[key],
    count: uploadTypeCounts.get(key) ?? 0,
  }));

  const allTypes = report.regions.flatMap((region) => region.types);

  const categoryKeys = ['collection', 'archives', 'exploration'];
  const categories = categoryKeys.map((key) => {
    const matching = report.regions.flatMap((region) => region.categories.filter((category) => category.key === key));
    const metric = sumMetrics(matching);
    return {
      key,
      name: matching[0]?.name ?? categoryName(key),
      metric,
      rate: metric.coverageRate,
    };
  }).filter((category) => category.metric.totalPoints > 0);

  const coreDefinitions = [
    { key: 'aurylene', name: '醚质', matches: (key: string) => key === 'aurylene' },
    { key: 'crates', name: '储藏箱', matches: (key: string) => key.startsWith('crate') },
    { key: 'archives', name: '档案', matches: (key: string) => key === 'archives' },
    { key: 'gather', name: '采集点', matches: (key: string) => key === 'gather' },
  ];
  const coreTypes = coreDefinitions.map((definition) => ({
    key: definition.key,
    name: definition.name,
    metric: sumMetrics(allTypes.filter((type) => definition.matches(type.key))),
  })).filter((item) => item.metric.totalPoints > 0);
  const coreCoverageRate = sumMetrics(coreTypes.map((item) => item.metric)).coverageRate;

  const otherTypeGroups = new Map<string, { name: string; metrics: ImageCoverageMetric[] }>();
  for (const type of allTypes) {
    if (coreDefinitions.some((definition) => definition.matches(type.key))) continue;
    const current = otherTypeGroups.get(type.key) ?? { name: type.name, metrics: [] };
    current.metrics.push(type);
    otherTypeGroups.set(type.key, current);
  }
  const otherTypes = [...otherTypeGroups.entries()]
    .map(([key, group]) => ({
      key,
      name: TYPE_NAMES[key] ?? group.name,
      metric: sumMetrics(group.metrics),
    }))
    .filter((item) => item.metric.totalPoints > 0)
    .sort((left, right) => right.metric.totalPoints - left.metric.totalPoints)
    .slice(0, 6);

  return {
    report,
    uploadCount: recentImageCount,
    imageCount,
    coverageRate: report.total.coverageRate,
    coreCoverageRate,
    uploadTypes,
    regions: report.regions.map((region) => ({
      key: region.key,
      name: region.name,
      metric: region,
      rate: region.coverageRate,
    })),
    categories,
    coreTypes,
    otherTypes,
    dailyUploads,
    ugcLikes,
    contributors: buildContributorStats(submissions, ugcLikes.contributorLikes ?? []),
  };
}

function buildContributorStats(
  submissions: PendingSubmission[],
  contributorLikes: UgcLikeReport['contributorLikes'],
): ContributorStats[] {
  const contributors = new Map<string, ContributorStats>();
  const likesByContributor = new Map(
    contributorLikes.map((contributor) => [contributor.userId, contributor.likeCount]),
  );

  for (const submission of submissions) {
    const role = submission.submitter?.role?.trim().toLowerCase();
    if (role === 'r' || role === 'robot') continue;

    const contributor = contributors.get(submission.userId) ?? {
      userId: submission.userId,
      publicUid: submission.submitter?.publicUid ?? null,
      nickname: submission.submitter?.nickname ?? null,
      karma: submission.submitter?.karma ?? null,
      imageCount: 0,
      commentCount: 0,
      totalCount: 0,
      likeCount: likesByContributor.get(submission.userId) ?? 0,
    };
    contributor.publicUid = submission.submitter?.publicUid ?? contributor.publicUid;
    contributor.nickname = submission.submitter?.nickname ?? contributor.nickname;
    contributor.karma = submission.submitter?.karma ?? contributor.karma;
    contributor.totalCount += 1;
    if (submission.kind === 'image') contributor.imageCount += 1;
    if (submission.kind === 'comment') contributor.commentCount += 1;
    contributors.set(submission.userId, contributor);
  }

  return sortContributorStats([...contributors.values()], 'contributions');
}

function buildDailyUploadCounts(submissions: PendingSubmission[]): ReportModel['dailyUploads'] {
  const chinaOffsetMs = 8 * 60 * 60 * 1000;
  const chinaToday = new Date(Date.now() + chinaOffsetMs);
  chinaToday.setUTCHours(0, 0, 0, 0);

  const items = Array.from({ length: 90 }, (_, index) => {
    const date = new Date(chinaToday);
    date.setUTCDate(date.getUTCDate() - (89 - index));
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });
  const counts = new Map(items.map((item) => [item.date, item]));

  for (const submission of submissions) {
    const createdAt = new Date(submission.createdAt);
    if (!Number.isFinite(createdAt.getTime())) continue;
    const chinaDate = new Date(createdAt.getTime() + chinaOffsetMs).toISOString().slice(0, 10);
    const item = counts.get(chinaDate);
    if (item) item.count += 1;
  }

  return items;
}

function isRedUploadDay(value: string): boolean {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 5 || day === 6;
}

function canonicalUploadTypeKey(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'archive' || key === 'archives' || key === '档案') return 'archives';
  return key;
}

function sumMetrics(metrics: ImageCoverageMetric[]): ImageCoverageMetric {
  const totalPoints = metrics.reduce((sum, metric) => sum + metric.totalPoints, 0);
  const coveredPoints = metrics.reduce((sum, metric) => sum + metric.coveredPoints, 0);
  const imageCount = metrics.reduce((sum, metric) => sum + metric.imageCount, 0);
  return {
    totalPoints,
    coveredPoints,
    missingPoints: Math.max(0, totalPoints - coveredPoints),
    imageCount,
    coverageRate: totalPoints > 0 ? coveredPoints / totalPoints : 0,
  };
}

function categoryName(key: string): string {
  if (key === 'collection') return '收集物';
  if (key === 'archives') return '档案';
  if (key === 'exploration') return '探索';
  return key;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function formatChartDate(value: string): string {
  if (!value) return '';
  return value.slice(5).replace('-', '/');
}
