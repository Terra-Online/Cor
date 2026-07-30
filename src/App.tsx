import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MODERATION_DATE_FETCH_LIMIT,
  MODERATION_STATUSES,
  type AdminUser,
  type DuplicateImageMarker,
  type ImageCoverageReport,
  type ModerationStatus,
  type OrphanImageReport,
  type PendingSubmission,
  type ReviewSubmissionStats,
  type SubmissionImage,
  archiveTestImages,
  fetchImageBlobUrl,
  getImageCoverage,
  getOrphanImages,
  getSession,
  listDuplicateImageMarkers,
  listDuplicateMarkerImages,
  listPendingSubmissions,
  runModerationSelected,
  startGoogleSignIn,
  updateSubmissionStatus,
} from './api';
import ImageCoverageView, { type CoverageRegionFilter } from './ImageCoverageView';
import OrphanImagesView from './OrphanImagesView';
import './styles.css';

type AccessState =
  | { status: 'loading' }
  | { status: 'denied'; message: string }
  | { status: 'ready'; user: AdminUser };

type BusyAction = {
  id: string;
  status: ModerationStatus;
} | {
  id: '__ai__';
  status: 'pending_openai';
} | null;

const STATUS_TRANSITIONS: Record<ModerationStatus, ModerationStatus[]> = {
  pending_openai: ['pending_audit', 'stale'],
  pending_audit: ['active', 'stale'],
  active: ['stale'],
  flagged: ['active', 'stale'],
  remove_request: ['active', 'stale'],
  stale: ['active'],
};

const MANUAL_QUEUE_STATUSES = new Set<ModerationStatus>(['pending_audit', 'flagged', 'remove_request']);
const REVIEWED_STATUSES = new Set<ModerationStatus>(['active', 'stale']);

type DateRangePreset = 'today' | '7d' | '30d' | 'custom';
type AdminView = 'review' | 'duplicates' | 'coverage' | 'orphans';

const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

export default function App() {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });
  const [items, setItems] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [signInBusy, setSignInBusy] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ id: string; url: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ModerationStatus | 'all'>('all');
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('7d');
  const [customDateRange, setCustomDateRange] = useState(() => defaultDateRange());
  const [serverStats, setServerStats] = useState<ReviewSubmissionStats | null>(null);
  const [resultLimit, setResultLimit] = useState(MODERATION_DATE_FETCH_LIMIT);
  const [activeView, setActiveView] = useState<AdminView>(() => initialView());
  const [duplicateMarkers, setDuplicateMarkers] = useState<DuplicateImageMarker[]>([]);
  const [duplicateTotal, setDuplicateTotal] = useState(0);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [selectedDuplicateMarkerId, setSelectedDuplicateMarkerId] = useState<string | null>(() => initialDuplicateMarker());
  const [duplicateImages, setDuplicateImages] = useState<SubmissionImage[]>([]);
  const [duplicateImageTotal, setDuplicateImageTotal] = useState(0);
  const [coverageReport, setCoverageReport] = useState<ImageCoverageReport | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageRegion, setCoverageRegion] = useState<CoverageRegionFilter>('all');
  const [orphanReport, setOrphanReport] = useState<OrphanImageReport | null>(null);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const queryDateRange = useMemo(
    () => resolveDateRange(dateRangePreset, customDateRange),
    [customDateRange, dateRangePreset],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => (
      (statusFilter === 'all' || item.status === statusFilter)
      && (!commentsOnly || item.kind === 'comment')
    )),
    [commentsOnly, items, statusFilter],
  );
  const selected = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [visibleItems, selectedId],
  );
  const selectedVisibleItems = useMemo(
    () => visibleItems.filter((item) => selectedIds.includes(item.id)),
    [selectedIds, visibleItems],
  );
  const pendingOpenAiItems = useMemo(
    () => visibleItems.filter((item) => item.status === 'pending_openai'),
    [visibleItems],
  );
  const manualQueueItems = useMemo(
    () => visibleItems.filter((item) => MANUAL_QUEUE_STATUSES.has(item.status)),
    [visibleItems],
  );
  const reviewedItems = useMemo(
    () => visibleItems.filter((item) => REVIEWED_STATUSES.has(item.status)),
    [visibleItems],
  );
  const statusCounts = useMemo(() => Object.fromEntries(
    MODERATION_STATUSES.map((status) => [
      status,
      serverStats?.byStatus.find((entry) => entry.status === status)?.count
        ?? items.filter((item) => item.status === status).length,
    ]),
  ) as Record<ModerationStatus, number>, [items, serverStats]);
  const uploadStats = useMemo(
    () => buildUploadStats(items, queryDateRange, serverStats),
    [items, queryDateRange, serverStats],
  );
  const selectedDuplicateMarker = useMemo(
    () => duplicateMarkers.find((item) => item.markerId === selectedDuplicateMarkerId) ?? duplicateMarkers[0] ?? null,
    [duplicateMarkers, selectedDuplicateMarkerId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPendingSubmissions({
        from: queryDateRange.startDate.toISOString(),
        to: queryDateRange.endDate.toISOString(),
        limit: MODERATION_DATE_FETCH_LIMIT,
      });
      const pending = result.items;
      setItems(pending);
      setServerStats(result.stats);
      setResultLimit(result.limit);
      setSelectedIds((current) => current.filter((id) => pending.some((item) => item.id === id)));
      setSelectedId((current) => {
        if (current && pending.some((item) => item.id === current)) return current;
        return pending[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load moderation queue.');
    } finally {
      setLoading(false);
    }
  }, [queryDateRange]);

  const refreshDuplicates = useCallback(async () => {
    setDuplicateLoading(true);
    setError(null);
    try {
      const result = await listDuplicateImageMarkers({ limit: 50 });
      setDuplicateMarkers(result.items);
      setDuplicateTotal(result.total);
      setSelectedDuplicateMarkerId((current) => {
        if (current && result.items.some((item) => item.markerId === current)) return current;
        return result.items[0]?.markerId ?? current ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duplicate image markers.');
    } finally {
      setDuplicateLoading(false);
    }
  }, []);

  const refreshCoverage = useCallback(async () => {
    setCoverageLoading(true);
    setError(null);
    try {
      setCoverageReport(await getImageCoverage());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image coverage.');
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  const refreshOrphans = useCallback(async () => {
    setOrphanLoading(true);
    setError(null);
    try {
      setOrphanReport(await getOrphanImages());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan orphan images.');
    } finally {
      setOrphanLoading(false);
    }
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  }, []);

  const selectVisible = useCallback(() => {
    setSelectedIds((current) => [...new Set([...current, ...visibleItems.map((item) => item.id)])]);
  }, [visibleItems]);

  const clearVisibleSelection = useCallback(() => {
    const visible = new Set(visibleItems.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => !visible.has(id)));
  }, [visibleItems]);

  useEffect(() => {
    let disposed = false;
    void getSession()
      .then((user) => {
        if (disposed) return;
        if (!user) {
          setAccess({
            status: 'denied',
            message: 'OEM admin session required. Sign in to Open Endfield Map with an admin account.',
          });
          return;
        }
        if (!isAdminRole(user.role)) {
          setAccess({
            status: 'denied',
            message: `OEM admin role required. Current role: ${user.role || 'unknown'}.`,
          });
          return;
        }
        setAccess({ status: 'ready', user });
      })
      .catch((err) => {
        if (!disposed) {
          setAccess({
            status: 'denied',
            message: err instanceof Error ? err.message : 'Unable to verify admin session.',
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (access.status !== 'ready' || activeView !== 'review') return;
    void refresh();
  }, [access.status, activeView, refresh]);

  useEffect(() => {
    if (access.status !== 'ready' || activeView !== 'duplicates') return;
    void refreshDuplicates();
  }, [access.status, activeView, refreshDuplicates]);

  useEffect(() => {
    if (access.status !== 'ready' || activeView !== 'coverage') return;
    void refreshCoverage();
  }, [access.status, activeView, refreshCoverage]);

  useEffect(() => {
    if (access.status !== 'ready' || activeView !== 'orphans') return;
    void refreshOrphans();
  }, [access.status, activeView, refreshOrphans]);

  useEffect(() => {
    if (access.status !== 'ready' || activeView !== 'duplicates' || !selectedDuplicateMarkerId) {
      setDuplicateImages([]);
      setDuplicateImageTotal(0);
      return;
    }

    let disposed = false;
    setDuplicateLoading(true);
    setError(null);
    void listDuplicateMarkerImages(selectedDuplicateMarkerId, { limit: 100 })
      .then((result) => {
        if (disposed) return;
        setDuplicateImages(result.items);
        setDuplicateImageTotal(result.total);
      })
      .catch((err) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load duplicate marker images.');
          setDuplicateImages([]);
          setDuplicateImageTotal(0);
        }
      })
      .finally(() => {
        if (!disposed) {
          setDuplicateLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [access.status, activeView, selectedDuplicateMarkerId]);

  useEffect(() => {
    setImagePreview(null);
    setImageError(null);
    if (!selected || selected.kind !== 'image' || !selected.filePath) return undefined;

    let disposed = false;
    let objectUrl: string | null = null;

    void fetchImageBlobUrl(selected.filePath)
      .then((url) => {
        objectUrl = url;
        if (disposed) {
          URL.revokeObjectURL(url);
          return;
        }
        setImagePreview({ id: selected.id, url });
      })
      .catch((err) => {
        if (!disposed) {
          setImageError(err instanceof Error ? err.message : 'Failed to load image.');
        }
      });

    return () => {
      disposed = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selected]);

  const decide = useCallback(async (id: string, status: ModerationStatus) => {
    setBusyAction({ id, status });
    setError(null);
    try {
      await updateSubmissionStatus(id, status, note.trim() || undefined);
      setNote('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update submission.');
    } finally {
      setBusyAction(null);
    }
  }, [note, refresh]);

  const updateMany = useCallback(async (targets: PendingSubmission[], status: ModerationStatus, label?: string) => {
    const validTargets = targets.filter((item) => STATUS_TRANSITIONS[item.status].includes(status));
    if (validTargets.length === 0) {
      setError(`No items can ${label ?? `move to ${status}`}.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await Promise.all(validTargets.map((item) => updateSubmissionStatus(item.id, status, note.trim() || undefined)));
      setNote('');
      await refresh();
      setError(`${label ?? `Moved to ${status}`}: ${validTargets.length} item(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${label ?? `move items to ${status}`}.`);
    } finally {
      setLoading(false);
    }
  }, [note, refresh]);

  const archiveTestImageSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await archiveTestImages();
      await refresh();
      setError(`Archived ${result.archivedRows} _test submissions. R2 objects and D1 rows were retained.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive _test images.');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const sendSelectedToAi = useCallback(async (targets: PendingSubmission[]) => {
    const pendingTargets = targets.filter((item) => item.status === 'pending_openai');
    if (pendingTargets.length === 0) {
      setError('No pending_openai items selected.');
      return;
    }

    setLoading(true);
    setBusyAction({ id: '__ai__', status: 'pending_openai' });
    setError(null);
    try {
      const processed = await runModerationSelected(pendingTargets.map((item) => item.id));
      await refresh();
      setError(`Sent ${pendingTargets.length} item(s) to AI review, processed ${processed}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send selected items to AI review.');
    } finally {
      setBusyAction(null);
      setLoading(false);
    }
  }, [refresh]);

  const sendCurrentToAi = useCallback(async () => {
    if (!selected || selected.status !== 'pending_openai') {
      setError('Current item is not pending_openai.');
      return;
    }

    setLoading(true);
    setBusyAction({ id: '__ai__', status: 'pending_openai' });
    setError(null);
    try {
      const processed = await runModerationSelected([selected.id]);
      await refresh();
      setError(`Sent current item to AI review, processed ${processed}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send current item to AI review.');
    } finally {
      setBusyAction(null);
      setLoading(false);
    }
  }, [refresh, selected]);

  const signIn = useCallback(async () => {
    setSignInBusy(true);
    setError(null);
    try {
      const redirectUrl = await startGoogleSignIn(window.location.href);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sign in.');
      setSignInBusy(false);
    }
  }, []);

  const stateActions = renderStateActions({
    statusFilter,
    selectedVisibleItems,
    loading,
    updateMany,
    sendSelectedToAi,
    aiBusy: busyAction?.id === '__ai__',
  });
  const activeViewLoading = activeView === 'review'
    ? loading
    : activeView === 'duplicates'
      ? duplicateLoading
      : activeView === 'coverage'
        ? coverageLoading
        : orphanLoading;
  const refreshActiveView = () => {
    if (activeView === 'duplicates') {
      void refreshDuplicates();
      return;
    }
    if (activeView === 'coverage') {
      void refreshCoverage();
      return;
    }
    if (activeView === 'orphans') {
      void refreshOrphans();
      return;
    }
    void refresh();
  };

  if (access.status === 'loading') {
    return <Shell title="OEM UGC Review"><div className="empty">Checking admin access...</div></Shell>;
  }

  if (access.status === 'denied') {
    return (
      <Shell title="OEM UGC Review">
        <div className="access-card">
          <h2>Access required</h2>
          <p>{access.message}</p>
          {error && <div className="error compact">{error}</div>}
          <button type="button" className="primary-link button-link" onClick={() => void signIn()} disabled={signInBusy}>
            {signInBusy ? 'Opening sign in...' : 'Open OEM sign in'}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="OEM UGC Review"
      user={access.user}
      actions={(
        <>
          <button
            type="button"
            className="icon-button"
            onClick={refreshActiveView}
            disabled={activeViewLoading}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            className={activeView === 'review' ? 'view-tab active' : 'view-tab'}
            onClick={() => setActiveView('review')}
          >
            Review
          </button>
          <button
            type="button"
            className={activeView === 'duplicates' ? 'view-tab active' : 'view-tab'}
            onClick={() => setActiveView('duplicates')}
          >
            Duplicate Images
          </button>
          <button
            type="button"
            className={activeView === 'coverage' ? 'view-tab active' : 'view-tab'}
            onClick={() => setActiveView('coverage')}
          >
            Image Coverage
          </button>
          <button
            type="button"
            className={activeView === 'orphans' ? 'view-tab active' : 'view-tab'}
            onClick={() => setActiveView('orphans')}
          >
            Orphans
          </button>
          <button type="button" className="danger-ghost" onClick={() => void archiveTestImageSubmissions()} disabled={loading}>Archive _test</button>
          {activeView === 'review' && (
            <button
              type="button"
              className={commentsOnly ? 'comment-filter active' : 'comment-filter'}
              aria-pressed={commentsOnly}
              onClick={() => setCommentsOnly((current) => !current)}
            >
              Comments only
            </button>
          )}
        </>
      )}
    >
      {error && <div className="error">{error}</div>}
      {activeView === 'review' ? (
        <>
          <section className="status-strip">
            <button
              type="button"
              className={statusFilter === 'all' ? 'status-chip active' : 'status-chip'}
              onClick={() => setStatusFilter('all')}
            >
              <span>All</span>
              <strong>{uploadStats.total}</strong>
            </button>
            {MODERATION_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? 'status-chip active' : 'status-chip'}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              >
                <span>{statusLabel(status)}</span>
                <strong>{statusCounts[status]}</strong>
              </button>
            ))}
          </section>
          <section className="stats-panel">
            <div className="stats-controls">
              <div>
                <h2>Uploads</h2>
                <p>
                  {formatDateRangeLabel(uploadStats.startDate, uploadStats.endDate)}
                  {' '}loaded {items.length} of {uploadStats.total}
                  {uploadStats.total > resultLimit ? `, capped at ${resultLimit}` : ''}
                </p>
              </div>
              <div className="date-tabs" role="group" aria-label="Date range">
                {DATE_RANGE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={dateRangePreset === preset.value ? 'date-tab active' : 'date-tab'}
                    onClick={() => setDateRangePreset(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="date-inputs">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={customDateRange.start}
                    onChange={(event) => {
                      setDateRangePreset('custom');
                      setCustomDateRange((current) => ({ ...current, start: event.target.value }));
                    }}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={customDateRange.end}
                    onChange={(event) => {
                      setDateRangePreset('custom');
                      setCustomDateRange((current) => ({ ...current, end: event.target.value }));
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="stats-summary">
              <div className="stats-total">
                <span>Total uploads</span>
                <strong>{uploadStats.total}</strong>
              </div>
              <div className="stats-breakdown">
                {uploadStats.byType.map((entry) => (
                  <div key={entry.type} className="stats-row">
                    <span>{entry.type}</span>
                    <strong>{entry.count}</strong>
                  </div>
                ))}
                {uploadStats.byType.length === 0 && <div className="stats-empty">No uploads in this range.</div>}
              </div>
            </div>
          </section>
        </>
      ) : activeView === 'duplicates' ? (
        <section className="duplicate-summary-panel">
          <div>
            <h2>Duplicate Image Markers</h2>
            <p>{duplicateMarkers.length} loaded of {duplicateTotal} markers with more than one visible image.</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshDuplicates()}
            disabled={duplicateLoading}
          >
            {duplicateLoading ? 'Loading...' : 'Refresh Duplicates'}
          </button>
        </section>
      ) : null}
      {activeView === 'review' && <section className="state-actions">
        <div className="state-action-buttons">{stateActions}</div>
        <strong>{selectedVisibleItems.length} selected / {visibleItems.length} visible / {uploadStats.total} total</strong>
      </section>}
      {activeView === 'review' ? <main className="review-layout">
        <section className="queue">
          <div className="queue-controls">
            <button type="button" onClick={selectVisible} disabled={visibleItems.length === 0}>Select All</button>
            <button type="button" onClick={clearVisibleSelection} disabled={selectedVisibleItems.length === 0}>Clear Selection</button>
          </div>
          {loading && visibleItems.length === 0 ? (
            <div className="empty">Loading queue...</div>
          ) : visibleItems.length === 0 ? (
            <div className="empty">No items.</div>
          ) : (
            <div className="queue-groups">
              {pendingOpenAiItems.length > 0 && (
                <section className="queue-group">
                  <div className="queue-group-head">
                    <strong>Pending OpenAI</strong>
                    <span>{pendingOpenAiItems.length}</span>
                  </div>
                  <div className="queue-items">
                    {pendingOpenAiItems.map((item) => (
                      <div
                        key={item.id}
                        className={item.id === selected?.id ? 'queue-item active' : 'queue-item'}
                      >
                        <label className="select-box" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </label>
                        <button type="button" className="queue-main" onClick={() => setSelectedId(item.id)}>
                          <span className="queue-title">
                            <strong>{formatItemTitle(item)}</strong>
                            <small>{formatKindStatus(item)}</small>
                          </span>
                          <span className="queue-line">{item.poiHash}</span>
                          <span className="queue-line">{formatQueueDetail(item)}</span>
                          {item.kind === 'image' && (
                            <span className="queue-flag-count">Flags {formatFlagCount(item.flagCount)}</span>
                          )}
                          {item.kind === 'comment' && item.content && (
                            <span className="queue-content">{item.content}</span>
                          )}
                          <span className="queue-time">{formatAuditSummary(item)}</span>
                          {item.moderationNote && <small className="queue-note">{item.moderationNote}</small>}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {manualQueueItems.length > 0 && (
                <section className="queue-group">
                  <div className="queue-group-head">
                    <strong>Manual Queue</strong>
                    <span>{manualQueueItems.length}</span>
                  </div>
                  <div className="queue-items">
                    {manualQueueItems.map((item) => (
                      <div
                        key={item.id}
                        className={item.id === selected?.id ? 'queue-item active' : 'queue-item'}
                      >
                        <label className="select-box" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </label>
                        <button type="button" className="queue-main" onClick={() => setSelectedId(item.id)}>
                          <span className="queue-title">
                            <strong>{formatItemTitle(item)}</strong>
                            <small>{formatKindStatus(item)}</small>
                          </span>
                          <span className="queue-line">{item.poiHash}</span>
                          <span className="queue-line">{formatQueueDetail(item)}</span>
                          {item.kind === 'image' && (
                            <span className="queue-flag-count">Flags {formatFlagCount(item.flagCount)}</span>
                          )}
                          {item.kind === 'comment' && item.content && (
                            <span className="queue-content">{item.content}</span>
                          )}
                          <span className="queue-time">{formatAuditSummary(item)}</span>
                          {item.moderationNote && <small className="queue-note">{item.moderationNote}</small>}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {reviewedItems.length > 0 && (
                <section className="queue-group">
                  <div className="queue-group-head">
                    <strong>Reviewed</strong>
                    <span>{reviewedItems.length}</span>
                  </div>
                  <div className="queue-items">
                    {reviewedItems.map((item) => (
                      <div
                        key={item.id}
                        className={item.id === selected?.id ? 'queue-item active' : 'queue-item'}
                      >
                        <label className="select-box" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </label>
                        <button type="button" className="queue-main" onClick={() => setSelectedId(item.id)}>
                          <span className="queue-title">
                            <strong>{formatItemTitle(item)}</strong>
                            <small>{formatKindStatus(item)}</small>
                          </span>
                          <span className="queue-line">{item.poiHash}</span>
                          <span className="queue-line">{formatQueueDetail(item)}</span>
                          {item.kind === 'image' && (
                            <span className="queue-flag-count">Flags {formatFlagCount(item.flagCount)}</span>
                          )}
                          {item.kind === 'comment' && item.content && (
                            <span className="queue-content">{item.content}</span>
                          )}
                          <span className="queue-time">{formatAuditSummary(item)}</span>
                          {item.moderationNote && <small className="queue-note">{item.moderationNote}</small>}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
        <section className="inspector">
          {selected ? (
            <>
              {selected.kind === 'image' ? (
                <div className="image-frame">
                  {imagePreview?.id === selected.id ? (
	                    <img
	                      src={imagePreview.url}
	                      alt={selected.content || selected.poiType}
	                    />
                  ) : (
                    <div className="image-placeholder">{imageError ?? 'Loading image...'}</div>
                  )}
                </div>
              ) : (
                <div className="text-frame">
                  <span>Comment</span>
                  <p>{selected.content || 'No text content returned.'}</p>
                </div>
              )}
              <div className="meta-grid">
                <div><span>Kind</span><strong>{selected.kind}</strong></div>
                <div><span>Snapshot</span><strong>{selected.snapshotId}</strong></div>
                <div><span>POI</span><strong>{selected.markerId}</strong></div>
                <div><span>Status</span><strong>{statusLabel(selected.status)}</strong></div>
                {selected.kind === 'image' && (
                  <>
                    <div><span>Flags</span><strong>{formatFlagCount(selected.flagCount)}</strong></div>
                    <div><span>MIME</span><strong>{selected.mimeType || '-'}</strong></div>
                    <div><span>Size</span><strong>{formatBytes(selected.sizeBytes)}</strong></div>
                  </>
                )}
                <div><span>Type</span><strong>{selected.poiType}</strong></div>
                <div><span>User</span><strong>{formatUserSummary(selected)}</strong></div>
                {selected.kind === 'comment' && (
                  <>
                    <div><span>Parent</span><strong>{selected.parentId || '-'}</strong></div>
                    <div><span>Depth</span><strong>{selected.commentDepth}</strong></div>
                  </>
                )}
                <div><span>Created</span><strong>{formatAuditTime(selected.createdAt)}</strong></div>
                <div><span>Updated</span><strong>{formatAuditTime(selected.updatedAt)}</strong></div>
              </div>
              <div className="link-row">
                <a href={pointShareUrl(selected.poiHash)} target="_blank" rel="noreferrer">Open point in frontend</a>
                {selected.submitter?.nickname && <span>{selected.submitter.nickname}</span>}
              </div>
              {selected.content && <p className="content">{selected.content}</p>}
              {selected.moderationNote && <p className="note">{selected.moderationNote}</p>}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Moderator note"
              />
              <div className="actions">
                {selected.status === 'pending_openai' && (
                  <button
                    type="button"
                    onClick={() => void sendCurrentToAi()}
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction?.id === '__ai__' ? 'Sending to AI...' : 'Send to AI Review'}
                  </button>
                )}
                {STATUS_TRANSITIONS[selected.status].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={status === 'active' ? 'approve' : status === 'stale' ? 'reject' : undefined}
                    onClick={() => void decide(selected.id, status)}
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction?.id === selected.id && busyAction.status === status ? 'Moving...' : actionLabel(status)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">Select an item.</div>
          )}
        </section>
      </main> : activeView === 'duplicates' ? (
        <main className="review-layout duplicate-layout">
          <section className="queue">
            {duplicateLoading && duplicateMarkers.length === 0 ? (
              <div className="empty">Loading duplicate markers...</div>
            ) : duplicateMarkers.length === 0 ? (
              <div className="empty">No duplicate image markers.</div>
            ) : (
              <div className="queue-items">
                {duplicateMarkers.map((item) => (
                  <button
                    key={item.markerId}
                    type="button"
                    className={item.markerId === selectedDuplicateMarker?.markerId ? 'duplicate-marker active' : 'duplicate-marker'}
                    onClick={() => setSelectedDuplicateMarkerId(item.markerId)}
                  >
                    <span className="queue-title">
                      <strong>{item.poiType || 'unknown'}</strong>
                      <small>{item.imageCount} images</small>
                    </span>
                    <span className="queue-line">{item.markerId}</span>
                    <span className="queue-line">{item.poiHash}</span>
                    <span className="queue-time">Latest {formatAuditTime(item.latestCreatedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="inspector">
            {selectedDuplicateMarker ? (
              <>
                <div className="duplicate-head">
                  <div>
                    <h2>{selectedDuplicateMarker.poiType || 'unknown'}</h2>
                    <p>{selectedDuplicateMarker.markerId} · {duplicateImageTotal} images</p>
                  </div>
                  <a href={pointShareUrl(selectedDuplicateMarker.poiHash)} target="_blank" rel="noreferrer">Open point</a>
                </div>
                <div className="duplicate-grid">
                  {duplicateImages.map((image) => (
                    <article key={image.id} className="duplicate-image-card">
                      <img src={image.url} alt={image.content || selectedDuplicateMarker.poiType || image.id} loading="lazy" />
                      <div>
                        <strong>{statusLabel(image.status)}</strong>
                        <span>{formatAuditTime(image.createdAt)}</span>
                        <span>{image.author ? `${image.author.nickname} / ${image.author.publicUid}` : 'Unknown author'}</span>
                        <span className="duplicate-flag-count">Flags {formatFlagCount(image.flagCount)}</span>
                        {image.content && <p>{image.content}</p>}
                      </div>
                    </article>
                  ))}
                  {duplicateImages.length === 0 && <div className="empty">No visible images for this marker.</div>}
                </div>
              </>
            ) : (
              <div className="empty">Select a duplicate marker.</div>
            )}
          </section>
        </main>
      ) : activeView === 'coverage' ? (
        <ImageCoverageView
          report={coverageReport}
          loading={coverageLoading}
          regionFilter={coverageRegion}
          onRegionFilterChange={setCoverageRegion}
          onRefresh={() => void refreshCoverage()}
        />
      ) : (
        <OrphanImagesView
          report={orphanReport}
          loading={orphanLoading}
          onRefresh={() => void refreshOrphans()}
        />
      )}
    </Shell>
  );
}

function Shell({
  title,
  user,
  actions,
  children,
}: {
  title: string;
  user?: AdminUser;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>{title}</h1>
          <p>admin.opendfieldmap.org</p>
        </div>
        <div className="header-actions">
          {actions}
          {user && <div className="user-pill">{user.nickname || user.email || user.uid}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}

function formatBytes(value: number | null): string {
  if (!value || !Number.isFinite(value)) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatAuditSummary(item: PendingSubmission): string {
  return `Created ${formatAuditTime(item.createdAt)} · Updated ${formatAuditTime(item.updatedAt)}`;
}

function formatAuditTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function buildUploadStats(
  items: PendingSubmission[],
  dateRange: { startDate: Date; endDate: Date },
  serverStats: ReviewSubmissionStats | null,
): {
  startDate: Date;
  endDate: Date;
  total: number;
  byType: { type: string; count: number }[];
} {
  const { startDate, endDate } = dateRange;
  if (serverStats) {
    return {
      startDate,
      endDate,
      total: serverStats.total,
      byType: serverStats.byType,
    };
  }

  const typeCounts = new Map<string, number>();
  let total = 0;

  for (const item of items) {
    const createdAt = new Date(item.createdAt);
    const timestamp = createdAt.getTime();
    if (!Number.isFinite(timestamp) || timestamp < startDate.getTime() || timestamp > endDate.getTime()) {
      continue;
    }

    const type = item.poiType || 'unknown';
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    total += 1;
  }

  const byType = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return { startDate, endDate, total, byType };
}

function resolveDateRange(
  preset: DateRangePreset,
  customDateRange: { start: string; end: string },
): { startDate: Date; endDate: Date } {
  if (preset === 'custom') {
    const fallback = defaultDateRange();
    return normalizeDateRange(
      parseDateInput(customDateRange.start, false) ?? parseDateInput(fallback.start, false) ?? startOfToday(),
      parseDateInput(customDateRange.end, true) ?? parseDateInput(fallback.end, true) ?? endOfToday(),
    );
  }

  const endDate = endOfToday();
  if (preset === 'today') {
    return { startDate: startOfToday(), endDate };
  }

  const days = preset === '30d' ? 30 : 7;
  const startDate = startOfToday();
  startDate.setDate(startDate.getDate() - days + 1);
  return { startDate, endDate };
}

function normalizeDateRange(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
  if (startDate.getTime() <= endDate.getTime()) {
    return { startDate, endDate };
  }
  return { startDate: startOfDay(endDate), endDate: endOfDay(startDate) };
}

function defaultDateRange(): { start: string; end: string } {
  const end = startOfToday();
  const start = startOfToday();
  start.setDate(start.getDate() - 6);
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

function parseDateInput(value: string, endOfDate: boolean): Date | null {
  if (!value) return null;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return null;
  return endOfDate ? endOfDay(date) : startOfDay(date);
}

function startOfToday(): Date {
  return startOfDay(new Date());
}

function endOfToday(): Date {
  return endOfDay(new Date());
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateRangeLabel(startDate: Date, endDate: Date): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function initialDuplicateMarker(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('duplicateMarker');
}

function initialView(): AdminView {
  if (initialDuplicateMarker()) return 'duplicates';
  if (typeof window === 'undefined') return 'review';
  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'coverage' || view === 'orphans' ? view : 'review';
}

function formatUserSummary(item: PendingSubmission): string {
  const userNo = item.submitter?.publicUid ?? item.userId;
  const group = item.submitter?.role ?? '-';
  const karma = typeof item.submitter?.karma === 'number' && Number.isFinite(item.submitter.karma)
    ? item.submitter.karma
    : '-';
  return `${userNo} / ${group} / K${karma}`;
}

function formatItemTitle(item: PendingSubmission): string {
  return item.poiType || (item.kind === 'comment' ? 'Comment' : 'Image');
}

function formatKindStatus(item: PendingSubmission): string {
  return `${item.kind} / ${statusLabel(item.status)}`;
}

function formatQueueDetail(item: PendingSubmission): string {
  const detail = item.kind === 'image'
    ? formatBytes(item.sizeBytes)
    : `${Math.max(0, item.content?.length ?? 0)} chars`;
  return `${formatUserSummary(item)} · ${detail}`;
}

function formatFlagCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return String(Math.max(0, Math.floor(value)));
}

function pointShareUrl(hash: string): string {
  return `https://oem.re/?x=${encodeURIComponent(hash)}`;
}

function isAdminRole(role: string | undefined): boolean {
  const normalized = role?.trim().toLowerCase();
  return normalized === 'a' || normalized === 'admin' || normalized === 'r' || normalized === 'robot';
}

function statusLabel(status: ModerationStatus): string {
  return status.replace(/_/g, ' ');
}

type StateActionContext = {
  statusFilter: ModerationStatus | 'all';
  selectedVisibleItems: PendingSubmission[];
  loading: boolean;
  updateMany: (targets: PendingSubmission[], status: ModerationStatus, label?: string) => Promise<void>;
  sendSelectedToAi: (targets: PendingSubmission[]) => Promise<void>;
  aiBusy: boolean;
};

function renderStateActions(context: StateActionContext): React.ReactNode {
  const {
    statusFilter,
    selectedVisibleItems,
    loading,
    updateMany,
    sendSelectedToAi,
    aiBusy,
  } = context;
  const selectedDisabled = loading || selectedVisibleItems.length === 0 || aiBusy;

  if (statusFilter === 'all') {
    return null;
  }

  if (statusFilter === 'pending_openai') {
    return (
      <>
        <button type="button" onClick={() => void sendSelectedToAi(selectedVisibleItems)} disabled={selectedDisabled}>
          {aiBusy ? 'Sending to AI...' : 'Send Selected to AI Review'}
        </button>
        <button type="button" onClick={() => void updateMany(selectedVisibleItems, 'pending_audit', 'pending audit selected')} disabled={selectedDisabled}>Pending Audit Selected</button>
        <button type="button" className="danger-ghost" onClick={() => void updateMany(selectedVisibleItems, 'stale', 'stale selected')} disabled={selectedDisabled}>Stale Selected</button>
      </>
    );
  }

  if (statusFilter === 'pending_audit') {
    return (
      <>
        <button type="button" className="approve" onClick={() => void updateMany(selectedVisibleItems, 'active', 'active selected')} disabled={selectedDisabled}>Active Selected</button>
        <button type="button" className="danger-ghost" onClick={() => void updateMany(selectedVisibleItems, 'stale', 'stale selected')} disabled={selectedDisabled}>Stale Selected</button>
      </>
    );
  }

  if (statusFilter === 'active') {
    return (
      <>
        <button type="button" className="danger-ghost" onClick={() => void updateMany(selectedVisibleItems, 'stale', 'stale selected')} disabled={selectedDisabled}>Stale Selected</button>
      </>
    );
  }

  if (statusFilter === 'flagged' || statusFilter === 'remove_request') {
    return (
      <>
        <button type="button" className="approve" onClick={() => void updateMany(selectedVisibleItems, 'active', 'active selected')} disabled={selectedDisabled}>Active Selected</button>
        <button type="button" className="danger-ghost" onClick={() => void updateMany(selectedVisibleItems, 'stale', 'stale selected')} disabled={selectedDisabled}>Stale Selected</button>
      </>
    );
  }

  return (
    <>
      <button type="button" className="approve" onClick={() => void updateMany(selectedVisibleItems, 'active', 'active selected')} disabled={selectedDisabled}>Active Selected</button>
    </>
  );
}

function actionLabel(status: ModerationStatus): string {
  if (status === 'active') return 'Move to active';
  if (status === 'pending_audit') return 'Send to audit';
  if (status === 'stale') return 'Move to stale';
  return `Move to ${statusLabel(status)}`;
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12A9 9 0 0 1 18.4 5.6L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
