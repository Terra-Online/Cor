import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MODERATION_STATUSES,
  type AdminUser,
  type ModerationStatus,
  type PendingSubmission,
  deleteStaleImages,
  deleteTestImages,
  fetchImageBlobUrl,
  getSession,
  listPendingSubmissions,
  runModerationOnce,
  runModerationSelected,
  startGoogleSignIn,
  updateSubmissionStatus,
} from './api';
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
  const [imagePixels, setImagePixels] = useState<{ id: string; width: number; height: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<ModerationStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visibleItems = useMemo(
    () => statusFilter === 'all' ? items : items.filter((item) => item.status === statusFilter),
    [items, statusFilter],
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
      items.filter((item) => item.status === status).length,
    ]),
  ) as Record<ModerationStatus, number>, [items]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pending = await listPendingSubmissions();
      setItems(pending);
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
        void refresh();
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
  }, [refresh]);

  useEffect(() => {
    setImagePreview(null);
    setImageError(null);
    setImagePixels(null);
    if (!selected) return undefined;

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

  const clearTestImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteTestImages();
      await refresh();
      setError(`Deleted ${result.deletedObjects} _test objects and ${result.deletedRows} rows.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete _test images.');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const clearStaleImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteStaleImages();
      await refresh();
      setError(`Deleted ${result.deletedObjects} stale objects and ${result.deletedRows} rows.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete stale images.');
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
          <button type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setBusyAction({ id: '__ai__', status: 'pending_openai' });
              setError(null);
              void runModerationOnce()
                .then(async (processed) => {
                  await refresh();
                  setError(`Sent queue to AI review, processed ${processed}.`);
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : 'Failed to run AI review.');
                })
                .finally(() => {
                  setBusyAction(null);
                  setLoading(false);
                });
            }}
            disabled={loading || busyAction?.id === '__ai__'}
          >
            {busyAction?.id === '__ai__' ? 'Sending to AI...' : 'Run AI Review'}
          </button>
          <button type="button" className="danger-ghost" onClick={() => void clearStaleImages()} disabled={loading}>Delete Stale</button>
          <button type="button" className="danger-ghost" onClick={() => void clearTestImages()} disabled={loading}>Delete _test</button>
        </>
      )}
    >
      {error && <div className="error">{error}</div>}
      <section className="status-strip">
        <button
          type="button"
          className={statusFilter === 'all' ? 'status-chip active' : 'status-chip'}
          onClick={() => setStatusFilter('all')}
        >
          <span>All</span>
          <strong>{items.length}</strong>
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
      <section className="state-actions">
        <div className="state-action-buttons">{stateActions}</div>
        <strong>{selectedVisibleItems.length} selected / {visibleItems.length} visible / {items.length} total</strong>
      </section>
      <main className="review-layout">
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
                            <strong>{item.poiType}</strong>
                            <small>{statusLabel(item.status)}</small>
                          </span>
                          <span className="queue-line">{item.poiHash}</span>
                          <span className="queue-line">{formatUserSummary(item)} · {formatBytes(item.sizeBytes)}</span>
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
                            <strong>{item.poiType}</strong>
                            <small>{statusLabel(item.status)}</small>
                          </span>
                          <span className="queue-line">{item.poiHash}</span>
                          <span className="queue-line">{formatUserSummary(item)} · {formatBytes(item.sizeBytes)}</span>
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
                            <strong>{item.poiType}</strong>
                            <small>{statusLabel(item.status)}</small>
                          </span>
                          <span className="queue-line">{item.poiHash}</span>
                          <span className="queue-line">{formatUserSummary(item)} · {formatBytes(item.sizeBytes)}</span>
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
              <div className="image-frame">
                {imagePreview?.id === selected.id ? (
                  <img
                    src={imagePreview.url}
                    alt={selected.content || selected.poiType}
                    onLoad={(event) => {
                      setImagePixels({
                        id: selected.id,
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                  />
                ) : (
                  <div className="image-placeholder">{imageError ?? 'Loading image...'}</div>
                )}
              </div>
              <div className="meta-grid">
                <div><span>Snapshot</span><strong>{selected.snapshotId}</strong></div>
                <div><span>POI</span><strong>{selected.markerId}</strong></div>
                <div><span>Status</span><strong>{statusLabel(selected.status)}</strong></div>
                <div><span>Type</span><strong>{selected.poiType}</strong></div>
                <div><span>User</span><strong>{formatUserSummary(selected)}</strong></div>
                <div><span>Pixels</span><strong>{formatPixels(selected, imagePixels)}</strong></div>
                <div><span>MIME</span><strong>{selected.mimeType || '-'}</strong></div>
                <div><span>Size</span><strong>{formatBytes(selected.sizeBytes)}</strong></div>
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
      </main>
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

function formatPixels(
  item: PendingSubmission,
  imagePixels: { id: string; width: number; height: number } | null,
): string {
  const width = imagePixels?.id === item.id ? imagePixels.width : null;
  const height = imagePixels?.id === item.id ? imagePixels.height : null;
  if (!width || !height) return '-';
  return `${width} x ${height}`;
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

function formatUserSummary(item: PendingSubmission): string {
  const userNo = item.submitter?.publicUid ?? item.userId;
  const group = item.submitter?.role ?? '-';
  const karma = typeof item.submitter?.karma === 'number' && Number.isFinite(item.submitter.karma)
    ? item.submitter.karma
    : '-';
  return `${userNo} / ${group} / K${karma}`;
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
