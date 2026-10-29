import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import AtlosReportPage from './AtlosReportPage';
import { ReportLocaleProvider } from './reportLocale';

it('counts real rejections separately from hidden approved and unknown records, and includes public A with pending B', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, '', '/atlos-report?lang=en');
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const common = {
    kind: 'image',
    createdAt: new Date().toISOString(),
    poiType: 'gather',
    userId: 'u',
    submitter: null,
  };
  const publicEdit = {
    ...common,
    id: 'edit',
    status: 'pending_audit',
    reviewStatus: 'pending_audit',
    publicSnapshot: { snapshotId: 'A', reviewStatus: 'approved' },
  };
  const hidden = [
    { ...common, id: 'rejected', status: 'stale', reviewStatus: 'rejected', publicSnapshot: null },
    {
      ...common,
      id: 'disabled',
      status: 'stale',
      reviewStatus: 'approved',
      adminDeletedAt: '2026-10-01',
      publicSnapshot: null,
    },
    { ...common, id: 'unknown', status: 'stale', reviewStatus: 'unknown', publicSnapshot: null },
  ];
  const reads: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname.endsWith('/coverage'))
        return Response.json({
          generatedAt: new Date().toISOString(),
          total: { totalPoints: 0, coveredPoints: 0, missingPoints: 0, imageCount: 0, coverageRate: 0 },
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
      const status = url.searchParams.get('status');
      return Response.json({
        items:
          status === 'active'
            ? []
            : status === 'stale'
              ? hidden
              : url.searchParams.get('offset') === '100'
                ? hidden
                : [publicEdit],
        nextOffset: !status && !url.searchParams.has('offset') ? 100 : null,
        offset: Number(url.searchParams.get('offset') || 0),
        limit: 100,
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
    expect(reads.at(-1)!.searchParams.get('offset')).toBe('100');
    expect(host.textContent).toContain('Show rejected');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
