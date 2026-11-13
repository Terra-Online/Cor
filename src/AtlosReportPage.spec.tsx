import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import type { ManagementSnapshot, PendingSubmission } from './api';
import AtlosReportPage from './AtlosReportPage';
import { ReportLocaleProvider } from './reportLocale';

it.each([
  { name: 'server-capped pagination', total: 4, pageCap: 2, maximumRequests: 2 },
  { name: 'production-sized history', total: 7944, pageCap: 10000, maximumRequests: 1 },
])('loads $name with bounded requests while preserving rejection and public-snapshot statistics', async ({ total, pageCap, maximumRequests }) => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, '', '/report?lang=en');
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const snapshot: ManagementSnapshot = {
    snapshotId: 'B',
    revision: 2,
    content: null,
    filePath: 'images/B.webp',
    mimeType: 'image/webp',
    sizeBytes: 100,
    reviewStatus: 'approved',
    createdAt: new Date().toISOString(),
  };
  const common: Omit<PendingSubmission, 'id'> = {
    kind: 'image',
    markerId: 'marker',
    poiHash: 'hash',
    poiType: 'gather',
    userId: 'u',
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    submitter: null,
    parentId: null,
    commentDepth: 0,
    authorDeletedAt: null,
    adminDeletedAt: null,
    adminDeletedBy: null,
    latestReviewAudit: null,
    flagCount: 0,
    frontier: snapshot,
    publicSnapshot: null,
    status: 'stale',
  };
  const publicEdit: PendingSubmission = {
    ...common,
    id: 'edit',
    status: 'pending_audit',
    frontier: { ...snapshot, reviewStatus: 'pending_audit' },
    publicSnapshot: { ...snapshot, snapshotId: 'A', revision: 1, filePath: 'images/A.webp' },
  };
  const hidden: PendingSubmission[] = [
    { ...common, id: 'rejected', frontier: { ...snapshot, reviewStatus: 'rejected' } },
    { ...common, id: 'disabled', adminDeletedAt: '2026-10-01' },
    { ...common, id: 'unknown', frontier: { ...snapshot, reviewStatus: 'unknown' } },
  ];
  const submissions = [publicEdit, ...hidden, ...Array.from({ length: total - 4 }, (_, index): PendingSubmission => ({
    ...common, id: `retained-${index}`, frontier: { ...snapshot, reviewStatus: 'unknown' },
  }))];
  const reads: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname.endsWith('/coverage'))
        return Response.json({
          generatedAt: new Date().toISOString(),
          total: {
            totalPoints: 0,
            coveredPoints: 0,
            missingPoints: 0,
            imageCount: 0,
            coverageRate: 0,
          },
          regions: [],
        });
      if (url.pathname.endsWith('/ugc-likes'))
        return Response.json({
          generatedAt: new Date().toISOString(),
          daily: [],
          contributorLikes: [],
          topImage: null,
        });
      reads.push(url);
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Math.min(Number(url.searchParams.get('limit')), pageCap);
      return Response.json({
        items: submissions.slice(offset, offset + limit),
        nextOffset: offset + limit < submissions.length ? offset + limit : null,
        offset,
        limit,
        stats: { total: submissions.length, byKind: [], byType: [], byStatus: [], byReviewStatus: [] },
      });
    }),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <ReportLocaleProvider>
          <AtlosReportPage />
        </ReportLocaleProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const today = [...host.querySelectorAll('.report-daily-bar')].at(-1);
    expect(today?.getAttribute('aria-label')).toContain('public 1 images, rejected 1 images');
    expect(reads.length).toBeLessThanOrEqual(maximumRequests);
    if (total === 4) expect(reads.at(-1)!.searchParams.get('offset')).toBe('2');
    expect(host.textContent).toContain('Show rejected');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
