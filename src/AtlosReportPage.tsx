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
  type UgcLikeReport,
  getImageCoverage,
  getPublicImageUrl,
  getUgcLikeReport,
  listPendingSubmissions,
} from './api';
import ReportHeader from './ReportHeader';
import { reportCategoryAsset, reportItemAsset } from './reportAssets';
import { formatReportInteger, useReportLocale, type ReportLocale } from './reportLocale';
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
  dailyUploads: Array<{ date: string; count: number; staleCount: number }>;
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
type UploadTrendRange = '7' | '30' | '90' | 'all';

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

const TYPE_NAMES: Record<ReportLocale, Record<string, string>> = {
  'zh-CN': { aurylene: '醚质', crate_i: '初级储藏箱', crate_ii: '中级储藏箱', crate_iii: '高级储藏箱', cratesurprise: '惊喜储藏箱', cratelocked: '上锁储藏箱', gather: '采集点', archives: '档案', crates: '储藏箱', wooden_box: '木箱', guiding_butterflies: '引路蝴蝶', pressure_plate: '压力板', aero_salvage: '浮空回收' },
  'zh-HK': { aurylene: '醚質', crate_i: '初級儲藏箱', crate_ii: '中級儲藏箱', crate_iii: '高級儲藏箱', cratesurprise: '驚喜儲藏箱', cratelocked: '上鎖儲藏箱', gather: '採集點', archives: '檔案', crates: '儲藏箱', wooden_box: '木箱', guiding_butterflies: '引路蝴蝶', pressure_plate: '壓力板', aero_salvage: '浮空回收' },
  en: { aurylene: 'Aurylene', crate_i: 'Basic Storage Crate', crate_ii: 'Intermediate Storage Crate', crate_iii: 'Advanced Storage Crate', cratesurprise: 'Surprise Storage Crate', cratelocked: 'Locked Storage Crate', gather: 'Gathering Point', archives: 'Archive', crates: 'Storage Crates', wooden_box: 'Wooden Box', guiding_butterflies: 'Guiding Butterflies', pressure_plate: 'Pressure Plate', aero_salvage: 'Aerial Salvage' },
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

const UPLOAD_TREND_RANGES: UploadTrendRange[] = ['7', '30', '90', 'all'];

const ATLOS_COPY = {
  'zh-CN': {
    title: '地图集影像计划', unavailable: '生产统计暂时不可用。', plan: '地图集影像计划', coreMetrics: '影像计划核心数据', uploads: '累计影像上传', collectionCoverage: '收集物点位覆盖', coreCoverage: '核心类型覆盖', coreTypeCoverage: '核心类型覆盖', imageUnit: ' 张', pointUnit: ' 点位', imagePointRatio: '图片点位比', otherCoverage: '其余类型覆盖', categoryCoverage: '分类覆盖率', typeImageTotal: '类型影像总量', totalCollection: '总收集率', regionComparison: '区域覆盖率对比', regionCoverage: '区域覆盖率', imageTotal: '图片总量', pointTotal: '点位总量', totalComparison: '图片总量与点位总量比较', imagePointTotal: '图片/点位量', imagesPerPoint: '张图片 / 点位', noUploadTypes: '本周期暂无可展示的上传分类。', typeComparison: '八类影像数量对比', dailyUploads: '每日上传数量', rangeLabel: '上传趋势时间范围', all: '全部', daySuffix: ' 天', showStale: '显示 stale', selectedStats: '所选范围上传统计', total: '合计', average: '日均', peak: '峰值', recent: '最近', dailyChart: '每日图片上传柱状图', includesStale: '，包含 stale', reactionTitle: 'UGC 点赞情况', noReactionPeriod: '暂无互动区间', reactionMetrics: 'UGC 点赞核心数据', validLikes: '当前有效点赞', likedUgc: '获赞 UGC', users: '参与用户', commentDislikes: '评论点踩', dailyLikes: '每日有效点赞', daysTotal: '90 天合计', likeChart: '最近九十天图片与评论有效点赞数量', images: '图片', comments: '评论', imageLikes: '图片点赞', commentLikes: '评论点赞', reactionMix: '反馈构成', mostLiked: '最受欢迎图片', viewMostLiked: '在地图中查看最受欢迎图片', likes: '点赞', viewPoint: '查看地图点位', noLikedImage: '暂无公开图片点赞数据', contributorsTitle: '最活跃贡献者', contributorSummary: '贡献者统计概览', contributors: '贡献者', ugcSubmissions: 'UGC 提交', perContributor: '人均贡献', topContributors: '最活跃的十名贡献者', rankUser: '排名 / 用户名 / OEM ID', imageComments: '图片 / 评论', receivedLikes: '获赞', contributions: '贡献量', totalContribution: '总贡献', viewAll: '查看全部', contributorUnit: ' 名贡献者', fullStats: '完整贡献者统计', closeStats: '关闭完整贡献者统计', rank: '排名', username: '用户名', sort: '排序', sortLabel: '贡献者排序方式', byLikes: '按图片与评论收到的点赞总量排序', byKarma: '按当前 Karma 分数排序', byContributions: '按图片与评论提交总量排序', unknown: '未知', noUsername: '未设置用户名', unassigned: '未分配', loading: '正在汇总生产环境影像数据', errorTitle: '暂时无法读取影像统计', retry: '重新读取', admin: '前往管理登录', separator: '，',
  },
  'zh-HK': {
    title: '地圖集影像計劃', unavailable: '生產統計暫時不可用。', plan: '地圖集影像計劃', coreMetrics: '影像計劃核心數據', uploads: '累計影像上傳', collectionCoverage: '收集物點位覆蓋', coreCoverage: '核心類型覆蓋', coreTypeCoverage: '核心類型覆蓋', imageUnit: ' 張', pointUnit: ' 點位', imagePointRatio: '圖片點位比', otherCoverage: '其餘類型覆蓋', categoryCoverage: '分類覆蓋率', typeImageTotal: '類型影像總量', totalCollection: '總收集率', regionComparison: '區域覆蓋率對比', regionCoverage: '區域覆蓋率', imageTotal: '圖片總量', pointTotal: '點位總量', totalComparison: '圖片總量與點位總量比較', imagePointTotal: '圖片/點位量', imagesPerPoint: '張圖片 / 點位', noUploadTypes: '本週期暫無可顯示的上傳分類。', typeComparison: '八類影像數量對比', dailyUploads: '每日上傳數量', rangeLabel: '上傳趨勢時間範圍', all: '全部', daySuffix: ' 日', showStale: '顯示 stale', selectedStats: '所選範圍上傳統計', total: '合計', average: '日均', peak: '高峰', recent: '最近', dailyChart: '每日圖片上傳柱狀圖', includesStale: '，包含 stale', reactionTitle: 'UGC 點讚情況', noReactionPeriod: '暫無互動期間', reactionMetrics: 'UGC 點讚核心數據', validLikes: '目前有效點讚', likedUgc: '獲讚 UGC', users: '參與用戶', commentDislikes: '評論負評', dailyLikes: '每日有效點讚', daysTotal: '90 日合計', likeChart: '最近九十日圖片與評論有效點讚數量', images: '圖片', comments: '評論', imageLikes: '圖片點讚', commentLikes: '評論點讚', reactionMix: '反饋構成', mostLiked: '最受歡迎圖片', viewMostLiked: '在地圖中查看最受歡迎圖片', likes: '點讚', viewPoint: '查看地圖點位', noLikedImage: '暫無公開圖片點讚數據', contributorsTitle: '最活躍貢獻者', contributorSummary: '貢獻者統計概覽', contributors: '貢獻者', ugcSubmissions: 'UGC 提交', perContributor: '人均貢獻', topContributors: '最活躍的十名貢獻者', rankUser: '排名 / 用戶名 / OEM ID', imageComments: '圖片 / 評論', receivedLikes: '獲讚', contributions: '貢獻量', totalContribution: '總貢獻', viewAll: '查看全部', contributorUnit: ' 名貢獻者', fullStats: '完整貢獻者統計', closeStats: '關閉完整貢獻者統計', rank: '排名', username: '用戶名', sort: '排序', sortLabel: '貢獻者排序方式', byLikes: '按圖片與評論收到的點讚總量排序', byKarma: '按目前 Karma 分數排序', byContributions: '按圖片與評論提交總量排序', unknown: '未知', noUsername: '未設定用戶名', unassigned: '未分配', loading: '正在匯總生產環境影像數據', errorTitle: '暫時無法讀取影像統計', retry: '重新讀取', admin: '前往管理員登入', separator: '，',
  },
  en: {
    title: 'Atlas Image Program', unavailable: 'Production statistics are temporarily unavailable.', plan: 'Atlas Image Program', coreMetrics: 'Key image program metrics', uploads: 'Total image uploads', collectionCoverage: 'Collectible point coverage', coreCoverage: 'Core type coverage', coreTypeCoverage: 'Core Type Coverage', imageUnit: ' images', pointUnit: ' points', imagePointRatio: 'image-to-point ratio', otherCoverage: 'Other Type Coverage', categoryCoverage: 'Category Coverage', typeImageTotal: 'Images by Type', totalCollection: 'Overall coverage', regionComparison: 'Regional coverage comparison', regionCoverage: 'Regional Coverage', imageTotal: 'Images', pointTotal: 'Points', totalComparison: 'Image and point total comparison', imagePointTotal: 'Images / Points', imagesPerPoint: 'images / point', noUploadTypes: 'No upload categories to display for this period.', typeComparison: 'Image count comparison across eight types', dailyUploads: 'Daily Uploads', rangeLabel: 'Upload trend range', all: 'All', daySuffix: ' days', showStale: 'Show stale', selectedStats: 'Upload statistics for selected range', total: 'Total', average: 'Daily avg.', peak: 'Peak', recent: 'Last ', dailyChart: ' daily image upload bar chart', includesStale: ', including stale', reactionTitle: 'UGC Reactions', noReactionPeriod: 'No reaction period available', reactionMetrics: 'Key UGC reaction metrics', validLikes: 'Current valid likes', likedUgc: 'Liked UGC', users: 'Participating users', commentDislikes: 'Comment dislikes', dailyLikes: 'Daily Valid Likes', daysTotal: '90-day total', likeChart: 'Valid image and comment likes over the last 90 days', images: 'Images', comments: 'Comments', imageLikes: 'Image likes', commentLikes: 'Comment likes', reactionMix: 'Reaction Mix', mostLiked: 'Most Liked Image', viewMostLiked: 'View the most liked image on the map', likes: 'Likes', viewPoint: 'View Map Point', noLikedImage: 'No public image like data', contributorsTitle: 'Most Active Contributors', contributorSummary: 'Contributor statistics overview', contributors: 'Contributors', ugcSubmissions: 'UGC submissions', perContributor: 'Avg. per contributor', topContributors: 'Ten most active contributors', rankUser: 'Rank / Username / OEM ID', imageComments: 'Images / Comments', receivedLikes: 'Likes', contributions: 'Contributions', totalContribution: 'Total contributions', viewAll: 'View all', contributorUnit: ' contributors', fullStats: 'Full Contributor Statistics', closeStats: 'Close full contributor statistics', rank: 'Rank', username: 'Username', sort: 'Sort', sortLabel: 'Contributor sort order', byLikes: 'Sorted by total likes received on images and comments', byKarma: 'Sorted by current Karma score', byContributions: 'Sorted by total image and comment submissions', unknown: 'Unknown', noUsername: 'Username not set', unassigned: 'Unassigned', loading: 'Compiling production image data', errorTitle: 'Unable to load image statistics', retry: 'Retry', admin: 'Go to admin sign-in', separator: ', ',
  },
} as const;

let activeReportScrollFrame = 0;

export default function AtlosReportPage() {
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const loadReport = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [report, submissions, staleSubmissions, ugcLikes] = await Promise.all([
        getImageCoverage(),
        listPendingSubmissions({
          statuses: ['active'],
          limit: MODERATION_DATE_FETCH_LIMIT,
        }),
        listPendingSubmissions({
          statuses: ['stale'],
          limit: MODERATION_DATE_FETCH_LIMIT,
        }),
        getUgcLikeReport(),
      ]);
      setState({
        status: 'ready',
        data: buildReportModel(
          report,
          submissions.items,
          ugcLikes,
          staleSubmissions.items,
        ),
      });
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
    <div className="report-page" data-state={state.status}>
      <ReportHeader
        active="images"
        generatedAt={state.status === 'ready' ? state.data.report.generatedAt : null}
      />
      {state.status === 'loading' && <ReportLoading />}
      {state.status === 'error' && (
        <ReportError message={state.message || copy.unavailable} onRetry={() => void loadReport()} />
      )}
      {state.status === 'ready' && <ReportContent model={state.data} />}
    </div>
  );
}

function ReportContent({ model }: { model: ReportModel }) {
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
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
          <h1>OPEN ENDFIELD MAP<small>{copy.plan}</small></h1>
        </div>

        <div className="report-primary-metrics" aria-label={copy.coreMetrics}>
          <Metric
            label={copy.uploads}
            value={model.uploadCount}
          />
          <Metric
            label={copy.collectionCoverage}
            value={model.coverageRate * 100}
            decimals={1}
            suffix="%"
          />
          <Metric
            label={copy.coreCoverage}
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
            <SectionHeading eyebrow="CORE TYPE COVERAGE" title={copy.coreTypeCoverage} />
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
                      <strong>{displayTypeName(item.key, item.name, locale)}</strong>
                      <small>{formatReportInteger(item.metric.imageCount, locale)}{copy.imageUnit} / {formatReportInteger(item.metric.totalPoints, locale)}{copy.pointUnit}</small>
                    </div>
                    <div className="report-core-progress" aria-label={`${displayTypeName(item.key, item.name, locale)} ${coverageRate.toFixed(1)}%${copy.separator}${copy.imagePointRatio} ${imageRate.toFixed(0)}%`}>
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
                  <h3>{copy.otherCoverage}</h3>
                </div>
                <div className="report-other-grid">
                  {model.otherTypes.map((item, index) => {
                    const coverageRate = Math.min(100, Math.max(0, item.metric.coverageRate * 100));
                    return (
                      <article className="report-other-row" key={item.key}>
                        <div className="report-other-copy">
                          <strong>{displayTypeName(item.key, item.name, locale)}</strong>
                          <small>{formatReportInteger(item.metric.imageCount, locale)}{copy.imageUnit} / {formatReportInteger(item.metric.totalPoints, locale)}{copy.pointUnit}</small>
                        </div>
                        <div className="report-other-progress" aria-label={`${displayTypeName(item.key, item.name, locale)} ${coverageRate.toFixed(1)}%`}>
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
              <strong>{copy.categoryCoverage}</strong>
            </p>
            {model.categories.map((category, index) => (
              <article className="report-category-row" key={category.key}>
                <img src={CATEGORY_ICONS[category.key] ?? reportCategoryAsset('collection')} alt="" />
                <div>
                  <div className="report-category-copy">
                    <strong>{displayCategoryName(category.key, category.name, locale)}</strong>
                    <span><AnimatedNumber active={detailVisible} value={category.rate * 100} decimals={1} />%</span>
                  </div>
                  <div className="report-horizontal-track">
                    <span style={{
                      '--chart-value': `${category.rate * 100}%`,
                      '--chart-delay': `${index * 130}ms`,
                    } as ChartStyle} />
                  </div>
                  <small>{formatReportInteger(category.metric.coveredPoints, locale)} / {formatReportInteger(category.metric.totalPoints, locale)} POINTS</small>
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
        onClick={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest('a, button, input, select, textarea')) return;
          scrollToReportSection(likesRef.current);
        }}
      >
        <div className="report-upload-types-section">
          <SectionHeading eyebrow="TYPE IMAGE TOTAL" title={copy.typeImageTotal} />
          <UploadChart active={uploadsVisible} items={model.uploadTypes} />
        </div>
        <DailyUploadChart active={uploadsVisible} items={model.dailyUploads} />
      </section>

      <UgcLikeSection
        sectionRef={likesRef}
        active={likesVisible}
        report={model.ugcLikes}
        onAdvance={() => scrollToReportSection(contributorsRef.current)}
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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
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
      name: copy.totalCollection,
      coveredPoints: model.report.total.coveredPoints,
      totalPoints: model.report.total.totalPoints,
      rate: model.coverageRate,
      aggregate: true,
    },
  ];

  return (
    <div className="report-hero-coverage" aria-label={copy.regionComparison}>
      <div className="report-coverage-heading">
        <div>
          <span>REGION COVERAGE</span>
          <h2>{copy.regionCoverage}</h2>
        </div>
      </div>
      <div className="report-region-rows">
        {items.map((item, index) => (
          <article className={`report-region-row${item.aggregate ? ' aggregate' : ''}`} key={item.key}>
            <div className="report-region-label">
              <strong>{item.aggregate ? item.name : displayRegionName(item.key, item.name, locale)}</strong>
              <span>{formatReportInteger(item.coveredPoints, locale)} / {formatReportInteger(item.totalPoints, locale)}</span>
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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  const maximum = Math.max(imageCount, pointCount, 1);
  const ratio = pointCount > 0 ? imageCount / pointCount : 0;
  const items = [
    { key: 'images', label: copy.imageTotal, value: imageCount },
    { key: 'points', label: copy.pointTotal, value: pointCount },
  ];

  return (
    <div className="report-total-comparison" aria-label={copy.totalComparison}>
      <p className="report-panel-label">
        <span>TOTAL IMAGE / POINT</span>
        <strong>{copy.imagePointTotal}</strong>
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
        <span>{copy.imagesPerPoint}</span>
      </div>
    </div>
  );
}

function UploadChart({ active, items }: { active: boolean; items: ReportModel['uploadTypes'] }) {
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  const maximum = Math.max(...items.map((item) => item.count), 1);
  if (items.length === 0) {
    return <div className="report-chart-empty">{copy.noUploadTypes}</div>;
  }

  return (
    <div className="report-upload-type-grid" aria-label={copy.typeComparison}>
      {items.map((item, index) => {
        const width = item.count > 0 ? Math.max(8, (item.count / maximum) * 100) : 0;
        return (
          <article
            className="report-upload-type-row"
            key={item.key}
            aria-label={`${displayTypeName(item.key, item.name, locale)}${copy.separator}${formatReportInteger(item.count, locale)}${copy.imageUnit}`}
          >
            <img src={TYPE_ICONS[item.key]} alt="" title={displayTypeName(item.key, item.name, locale)} />
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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  const [range, setRange] = useState<UploadTrendRange>('90');
  const [showStale, setShowStale] = useState(false);
  const visibleItems = useMemo(() => {
    if (range === 'all') return items;
    return items.slice(-Number(range));
  }, [items, range]);
  const itemTotal = (item: ReportModel['dailyUploads'][number]) => (
    item.count + item.staleCount
  );
  const maximum = Math.max(...visibleItems.map(itemTotal), 1);
  const total = visibleItems.reduce((sum, item) => sum + itemTotal(item), 0);
  const average = visibleItems.length > 0 ? total / visibleItems.length : 0;
  const rangeLabel = range === 'all' ? 'ALL TIME' : `${range} DAY`;
  const chartStyle = {
    '--chart-min-width': `${Math.max(620, visibleItems.length * 5)}px`,
    '--day-count': visibleItems.length,
  } as CSSProperties;

  return (
    <div className="report-daily-section">
      <div className="report-daily-heading">
        <div>
          <span>{rangeLabel} UPLOAD ACTIVITY</span>
          <h2>{copy.dailyUploads}</h2>
        </div>
        <div className="report-daily-controls">
          <div className="report-daily-range-tabs" role="group" aria-label={copy.rangeLabel}>
            {UPLOAD_TREND_RANGES.map((item) => (
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
          <label className="report-stale-toggle">
            <input
              type="checkbox"
              checked={showStale}
              onChange={(event) => setShowStale(event.target.checked)}
            />
            <span aria-hidden="true" />
            {copy.showStale}
          </label>
        </div>
      </div>
      <div className="report-daily-summary" aria-label={copy.selectedStats}>
        <p><span>{copy.total}</span><strong><AnimatedNumber active={active} value={total} /></strong></p>
        <p><span>{copy.average}</span><strong><AnimatedNumber active={active} value={average} decimals={1} /></strong></p>
        <p><span>{copy.peak}</span><strong><AnimatedNumber active={active} value={maximum} /></strong></p>
      </div>
      <div className="report-daily-chart-scroll">
        <div
          className="report-daily-chart"
          style={chartStyle}
          aria-label={`${range === 'all' ? copy.all : `${copy.recent}${range}${copy.daySuffix}`}${copy.dailyChart}${showStale ? copy.includesStale : ''}`}
        >
          {visibleItems.map((item, index) => {
            const activeHeight = item.count > 0 ? Math.max(3, (item.count / maximum) * 100) : 0;
            const staleHeight = item.staleCount > 0 ? Math.max(3, (item.staleCount / maximum) * 100) : 0;
            const description = `active ${formatReportInteger(item.count, locale)}${copy.imageUnit}${copy.separator}stale ${formatReportInteger(item.staleCount, locale)}${copy.imageUnit}`;
            return (
              <div
                className={`report-daily-bar${isRedUploadDay(item.date) ? ' is-red-day' : ''}`}
                key={item.date}
                title={`${formatChartDate(item.date)} · ${description}`}
                aria-label={`${formatChartDate(item.date)}，${description}`}
              >
                <span style={{
                  '--chart-value': `${activeHeight}%`,
                  '--chart-delay': `${index * 12}ms`,
                } as ChartStyle} />
                {showStale && (
                  <i style={{
                    '--chart-value': `${staleHeight}%`,
                    '--chart-delay': `${index * 12}ms`,
                  } as ChartStyle} />
                )}
              </div>
            );
          })}
        </div>
        <div className="report-daily-axis" style={chartStyle} aria-hidden="true">
          <span>{formatChartDate(visibleItems[0]?.date ?? '')}</span>
          <span>{range === 'all' ? 'ALL' : `${range} DAYS`}</span>
          <span>{formatChartDate(visibleItems.at(-1)?.date ?? '')}</span>
        </div>
      </div>
    </div>
  );
}

function UgcLikeSection({
  sectionRef,
  active,
  report,
  onAdvance,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  active: boolean;
  report: UgcLikeReport;
  onAdvance: () => void;
}) {
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  const daily = fillDailyUgcLikes(report.daily).slice(-90);
  const maximum = Math.max(...daily.map((item) => item.imageLikes + item.commentLikes), 1);
  const recentTotal = daily.reduce(
    (sum, item) => sum + item.imageLikes + item.commentLikes,
    0,
  );
  const mix = [
    { key: 'images', label: copy.imageLikes, value: report.imageLikes },
    { key: 'comments', label: copy.commentLikes, value: report.commentLikes },
    { key: 'dislikes', label: copy.commentDislikes, value: report.commentDislikes },
  ];
  const mixMaximum = Math.max(...mix.map((item) => item.value), 1);

  return (
    <section
      ref={sectionRef}
      className="report-band report-likes-band report-click-page"
      data-visible={active}
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('a, button, input, select, textarea')) return;
        onAdvance();
      }}
    >
      <div className="report-likes-heading">
        <div>
          <span>UGC REACTION SIGNAL</span>
          <h2>{copy.reactionTitle}</h2>
          <p>{formatDatePeriod(report.firstReactionDate, report.lastReactionDate, locale)}</p>
        </div>
        <div className="report-likes-metrics" aria-label={copy.reactionMetrics}>
          <Metric label={copy.validLikes} value={report.totalLikes} />
          <Metric label={copy.likedUgc} value={report.likedSubmissions} />
          <Metric label={copy.users} value={report.uniqueReactors} />
          <Metric label={copy.commentDislikes} value={report.commentDislikes} />
        </div>
      </div>

      <div className="report-likes-grid">
        <div className="report-likes-trend">
          <div className="report-likes-panel-heading">
            <div>
              <span>90 DAY LIKE ACTIVITY</span>
              <h3>{copy.dailyLikes}</h3>
            </div>
            <div>
              <span>{copy.daysTotal}</span>
              <strong><AnimatedNumber active={active} value={recentTotal} /></strong>
            </div>
          </div>
          <div className="report-like-chart" aria-label={copy.likeChart}>
            {daily.map((item, index) => {
              const count = item.imageLikes + item.commentLikes;
              const height = count > 0 ? Math.max(3, (count / maximum) * 100) : 0;
              return (
                <div
                  className="report-like-daily-bar"
                  key={item.date}
                  title={`${formatChartDate(item.date)} · ${copy.images} ${formatReportInteger(item.imageLikes, locale)} / ${copy.comments} ${formatReportInteger(item.commentLikes, locale)}`}
                  aria-label={`${formatChartDate(item.date)}${copy.separator}${copy.imageLikes} ${formatReportInteger(item.imageLikes, locale)}${copy.separator}${copy.commentLikes} ${formatReportInteger(item.commentLikes, locale)}`}
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
                <h3>{copy.reactionMix}</h3>
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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  return (
    <div className="report-popular-image">
      <div className="report-likes-panel-heading">
        <div>
          <span>MOST LIKED IMAGE</span>
          <h3>{copy.mostLiked}</h3>
        </div>
      </div>
      {image ? (
        <a
          className="report-popular-image-link"
          href={image.pointUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${copy.viewMostLiked}${copy.separator}${formatReportInteger(image.likeCount, locale)} ${copy.likes}`}
        >
          <span className="report-popular-image-media">
            <img
              src={getPublicImageUrl(image.filePath)}
              alt={`${displayPoiType(image.poiType, locale)} ${copy.images}`}
            />
          </span>
          <span className="report-popular-image-meta">
            <span>
              <strong>{displayPoiType(image.poiType, locale)}</strong>
              <small>POINT {image.markerId}</small>
            </span>
            <span>
              <strong>{formatReportInteger(image.likeCount, locale)}</strong>
              <small>{copy.likes}</small>
            </span>
          </span>
          <span className="report-popular-image-action">{copy.viewPoint}</span>
        </a>
      ) : (
        <div className="report-popular-image-empty">{copy.noLikedImage}</div>
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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
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
          <h2>{copy.contributorsTitle}</h2>
          <p>{contributorSortDescription(sort, locale)}</p>
          <ContributorSortControl value={sort} onChange={setSort} />
        </div>
        <div className="report-contributors-summary" aria-label={copy.contributorSummary}>
          <p><span>{copy.contributors}</span><strong><AnimatedNumber active={active} value={contributors.length} /></strong></p>
          <p><span>{copy.ugcSubmissions}</span><strong><AnimatedNumber active={active} value={totalContributions} /></strong></p>
          <p><span>{copy.perContributor}</span><strong><AnimatedNumber active={active} value={average} decimals={1} /></strong></p>
        </div>
      </div>

      <div className="report-contributor-list" aria-label={copy.topContributors}>
        <div className="report-contributor-columns" aria-hidden="true">
          <span>{copy.rankUser}</span>
          <span>KARMA</span>
          <span>{copy.imageComments}</span>
          <span>{copy.receivedLikes}</span>
          <span>{copy.contributions}</span>
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
                <strong>{contributorUsername(contributor, locale)}</strong>
                <small>OEM {contributorOemId(contributor, locale)}</small>
              </span>
            </span>
            <strong
              className="report-contributor-karma"
              aria-label={`Karma ${contributor.karma === null ? copy.unknown : formatReportInteger(contributor.karma, locale)}`}
            >
              {contributor.karma === null ? '-' : formatReportInteger(contributor.karma, locale)}
            </strong>
            <span className="report-contributor-split">
              <b><small>{copy.images}</small>{formatReportInteger(contributor.imageCount, locale)}</b>
              <i>/</i>
              <b><small>{copy.comments}</small>{formatReportInteger(contributor.commentCount, locale)}</b>
            </span>
            <strong
              className="report-contributor-likes"
              aria-label={`${copy.receivedLikes} ${formatReportInteger(contributor.likeCount, locale)}`}
              data-label={copy.receivedLikes}
            >
              {formatReportInteger(contributor.likeCount, locale)}
            </strong>
            <span className="report-contributor-total" aria-label={`${copy.totalContribution} ${formatReportInteger(contributor.totalCount, locale)}`} data-label={copy.contributions}>
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

      <div className="report-contributors-actions">
        <button
          type="button"
          className="report-contributors-expand"
          onClick={() => setExpanded(true)}
        >
          {copy.viewAll} {formatReportInteger(contributors.length, locale)}{copy.contributorUnit}
        </button>
      </div>

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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
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
            <h2 id="contributor-dialog-title">{copy.fullStats}</h2>
          </div>
          <ContributorSortControl value={sort} onChange={onSortChange} compact />
          <button type="button" onClick={onClose} aria-label={copy.closeStats} autoFocus>×</button>
        </header>
        <div className="report-contributor-table-wrap">
          <table className="report-contributor-table">
            <thead>
              <tr>
                <th>{copy.rank}</th>
                <th>{copy.username}</th>
                <th>OEM ID</th>
                <th>Karma</th>
                <th>{copy.images}</th>
                <th>{copy.comments}</th>
                <th>{copy.receivedLikes}</th>
                <th>{copy.totalContribution}</th>
              </tr>
            </thead>
            <tbody>
              {contributors.map((contributor, index) => (
                <tr key={contributor.userId}>
                  <td>{index + 1}</td>
                  <td><strong>{contributorUsername(contributor, locale)}</strong></td>
                  <td>{contributorOemId(contributor, locale)}</td>
                  <td>{contributor.karma === null ? '-' : formatReportInteger(contributor.karma, locale)}</td>
                  <td>{formatReportInteger(contributor.imageCount, locale)}</td>
                  <td>{formatReportInteger(contributor.commentCount, locale)}</td>
                  <td><strong>{formatReportInteger(contributor.likeCount, locale)}</strong></td>
                  <td><strong>{formatReportInteger(contributor.totalCount, locale)}</strong></td>
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
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
  const options: Array<{ value: ContributorSort; label: string }> = [
    { value: 'contributions', label: copy.contributions },
    { value: 'likes', label: copy.receivedLikes },
    { value: 'karma', label: 'Karma' },
  ];

  return (
    <div className="report-contributor-sort" data-compact={compact || undefined}>
      <span>{copy.sort}</span>
      <div role="group" aria-label={copy.sortLabel}>
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

function contributorSortDescription(sort: ContributorSort, locale: ReportLocale): string {
  if (sort === 'likes') return ATLOS_COPY[locale].byLikes;
  if (sort === 'karma') return ATLOS_COPY[locale].byKarma;
  return ATLOS_COPY[locale].byContributions;
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

function contributorUsername(contributor: ContributorStats, locale: ReportLocale = 'zh-CN'): string {
  return contributor.nickname?.trim() || ATLOS_COPY[locale].noUsername;
}

function contributorOemId(contributor: ContributorStats, locale: ReportLocale): string {
  return contributor.publicUid?.trim() || ATLOS_COPY[locale].unassigned;
}

function displayPoiType(value: string, locale: ReportLocale): string {
  const key = canonicalUploadTypeKey(value);
  return displayTypeName(key, value.replace(/[_-]+/g, ' '), locale);
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

function formatDatePeriod(first: string | null, last: string | null, locale: ReportLocale): string {
  if (!first || !last) return ATLOS_COPY[locale].noReactionPeriod;
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
  const { locale } = useReportLocale();
  const [displayValue, setDisplayValue] = useState(0);
  const formatter = useMemo(() => new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }), [decimals, locale]);

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
  const { locale } = useReportLocale();
  return (
    <main className="report-loading" aria-live="polite">
      <div className="report-loader-mark" aria-hidden="true"><span /></div>
      <p>CONNECTING TO TERRAIN ARCHIVE</p>
      <strong>{ATLOS_COPY[locale].loading}</strong>
      <div className="report-loader-track"><span /></div>
    </main>
  );
}

function ReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { locale } = useReportLocale();
  const copy = ATLOS_COPY[locale];
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

function buildReportModel(
  report: ImageCoverageReport,
  submissions: PendingSubmission[],
  ugcLikes: UgcLikeReport,
  staleSubmissions: PendingSubmission[],
): ReportModel {
  const imageSubmissions = submissions.filter((submission) => submission.kind === 'image');
  const staleImageSubmissions = staleSubmissions.filter((submission) => submission.kind === 'image');
  const allSubmissions = [...submissions, ...staleSubmissions];
  const allImageSubmissions = [...imageSubmissions, ...staleImageSubmissions];
  const imageCount = allImageSubmissions.length;
  const dailyUploads = buildDailyUploadCounts(imageSubmissions, staleImageSubmissions);
  const uploadCount = allImageSubmissions.length;
  const uploadTypeCounts = new Map<string, number>();
  for (const submission of imageSubmissions) {
    const key = canonicalUploadTypeKey(submission.poiType);
    uploadTypeCounts.set(key, (uploadTypeCounts.get(key) ?? 0) + 1);
  }

  const uploadTypes = UPLOAD_TYPE_ORDER.map((key) => ({
    key,
    name: TYPE_NAMES['zh-CN'][key],
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
      name: TYPE_NAMES['zh-CN'][key] ?? group.name,
      metric: sumMetrics(group.metrics),
    }))
    .filter((item) => item.metric.totalPoints > 0)
    .sort((left, right) => right.metric.totalPoints - left.metric.totalPoints)
    .slice(0, 6);

  return {
    report,
    uploadCount,
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
    contributors: buildContributorStats(allSubmissions, ugcLikes.contributorLikes ?? []),
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

function buildDailyUploadCounts(
  submissions: PendingSubmission[],
  staleSubmissions: PendingSubmission[],
): ReportModel['dailyUploads'] {
  const chinaOffsetMs = 8 * 60 * 60 * 1000;
  const chinaToday = new Date(Date.now() + chinaOffsetMs);
  chinaToday.setUTCHours(0, 0, 0, 0);
  const minimumStart = new Date(chinaToday);
  minimumStart.setUTCDate(minimumStart.getUTCDate() - 89);
  const earliestCreatedAt = [...submissions, ...staleSubmissions].reduce<Date | null>((earliest, submission) => {
    const createdAt = new Date(submission.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return earliest;
    const chinaDate = new Date(createdAt.getTime() + chinaOffsetMs);
    chinaDate.setUTCHours(0, 0, 0, 0);
    return !earliest || chinaDate < earliest ? chinaDate : earliest;
  }, null);
  const startDate = earliestCreatedAt && earliestCreatedAt < minimumStart
    ? earliestCreatedAt
    : minimumStart;
  const dayCount = Math.floor((chinaToday.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const items = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), count: 0, staleCount: 0 };
  });
  const counts = new Map(items.map((item) => [item.date, item]));

  for (const [rows, key] of [
    [submissions, 'count'],
    [staleSubmissions, 'staleCount'],
  ] as const) {
    for (const submission of rows) {
      const createdAt = new Date(submission.createdAt);
      if (!Number.isFinite(createdAt.getTime())) continue;
      const chinaDate = new Date(createdAt.getTime() + chinaOffsetMs).toISOString().slice(0, 10);
      const item = counts.get(chinaDate);
      if (item) item[key] += 1;
    }
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

function displayTypeName(key: string, fallback: string, locale: ReportLocale): string {
  return TYPE_NAMES[locale][key] ?? (locale === 'en' ? humanizeKey(key, fallback) : fallback);
}

function displayCategoryName(key: string, fallback: string, locale: ReportLocale): string {
  const names: Record<ReportLocale, Record<string, string>> = {
    'zh-CN': { collection: '收集物', archives: '档案', exploration: '探索' },
    'zh-HK': { collection: '收集物', archives: '檔案', exploration: '探索' },
    en: { collection: 'Collection', archives: 'Archives', exploration: 'Exploration' },
  };
  return names[locale][key] ?? (locale === 'en' ? humanizeKey(key, fallback) : fallback);
}

function displayRegionName(key: string, fallback: string, locale: ReportLocale): string {
  const normalized = key.trim().toUpperCase();
  if (normalized === 'WL') return locale === 'en' ? 'Wuling' : '武陵';
  if (normalized === 'VL') return locale === 'en' ? 'Valley IV' : locale === 'zh-HK' ? '四號谷地' : '四号谷地';
  return locale === 'en' ? humanizeKey(key, fallback) : fallback;
}

function humanizeKey(key: string, fallback: string): string {
  const source = [...fallback].every((character) => character.charCodeAt(0) <= 127) ? fallback : key;
  return source.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatChartDate(value: string): string {
  if (!value) return '';
  return value.slice(5).replace('-', '/');
}
