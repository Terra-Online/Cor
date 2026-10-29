import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { PendingSubmission } from './api';

let root: Root;
let host: HTMLDivElement;
let requests: { url: URL; body: Record<string, unknown> }[];
let rows: PendingSubmission[];
let reads: URL[];
let respondToPatch: (url: URL, body: Record<string, unknown>) => Promise<Response>;
let nextOffset: number | null;

function row(id = 'comment'): PendingSubmission {
  return {
    id,
    kind: 'comment',
    markerId: 'marker',
    poiHash: 'hash',
    poiType: 'poi',
    userId: 'author',
    snapshotId: 'B',
    reviewStatus: 'pending_openai',
    content: 'Frontier text',
    filePath: null,
    frontier: {
      snapshotId: 'B',
      revision: 2,
      content: 'Frontier text',
      filePath: null,
      mimeType: null,
      sizeBytes: null,
      reviewStatus: 'pending_openai',
      createdAt: '2026-10-28',
    },
    publicSnapshotId: 'A',
    publicSnapshot: {
      snapshotId: 'A',
      revision: 1,
      content: 'Public text',
      filePath: null,
      mimeType: null,
      sizeBytes: null,
      reviewStatus: 'approved',
      createdAt: '2026-10-27',
    },
    reportSnapshotId: 'A',
    status: 'pending_openai',
    flagCount: 2,
    authorDeletedAt: null,
    adminDeletedAt: null,
    adminDeletedBy: null,
    latestReviewAudit: null,
    mimeType: null,
    sizeBytes: null,
    parentId: null,
    commentDepth: 0,
    submitter: null,
    createdAt: '2026-10-27',
    updatedAt: '2026-10-28',
  };
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === text);
  expect(button, text).toBeTruthy();
  await act(async () => {
    button!.click();
  });
  await flush();
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, '', '/');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  rows = [row()];
  requests = [];
  reads = [];
  nextOffset = null;
  respondToPatch = async () => Response.json({ ok: true, actorUserId: 'admin', outcome: 'committed' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname.endsWith('/session')) return Response.json({ user: { uid: 'admin', role: 'a' } });
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        requests.push({ url, body });
        return respondToPatch(url, body);
      }
      reads.push(url);
      return Response.json({
        items: rows,
        stats: null,
        limit: 100,
        offset: Number(url.searchParams.get('offset') || 0),
        nextOffset,
      });
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<App />));
  await flush();
}
it('clears reports on public A while review captures the displayed frontier B and phase', async () => {
  await mount();
  expect(host.textContent).toContain('Public text');
  await click('Clear flags');
  expect(requests[0].body).toEqual({ action: 'clear_flags', snapshotId: 'A' });
  await click('Approve');
  expect(requests[1].body).toEqual({ action: 'approve', snapshotId: 'B', expectedReviewStatus: 'pending_openai' });
});

it('settles a partial bulk failure before refreshing once and never replays successful commands', async () => {
  rows = [
    row('one'),
    {
      ...row('two'),
      snapshotId: 'C',
      frontier: { ...row().frontier, snapshotId: 'C', reviewStatus: 'pending_audit' },
      reviewStatus: 'pending_audit',
    },
  ];
  let finish: (response: Response) => void = () => {};
  respondToPatch = async (url) =>
    url.pathname.includes('/one/')
      ? Response.json({ code: 'MODERATION_CONFLICT' }, { status: 409 })
      : new Promise((resolve) => {
          finish = resolve;
        });
  await mount();
  await click('Select All');
  const before = reads.length;
  await click('Approve selected');
  expect(reads).toHaveLength(before);
  expect(requests.map((request) => request.body)).toEqual([
    { action: 'approve', snapshotId: 'B', expectedReviewStatus: 'pending_openai' },
    { action: 'approve', snapshotId: 'C', expectedReviewStatus: 'pending_audit' },
  ]);
  rows = [{ ...row('one'), snapshotId: 'D', frontier: { ...row().frontier, snapshotId: 'D' } }];
  await act(async () => {
    finish(Response.json({ ok: true, outcome: 'committed', actorUserId: 'admin' }));
  });
  await flush();
  expect(reads).toHaveLength(before + 1);
  expect(host.textContent).toContain('1 committed, 0 unchanged, 1 conflicts, 0 failed');
  expect(host.textContent).toContain('click again');
  expect(requests).toHaveLength(2);
  await click('Approve');
  expect(requests[2].body).toMatchObject({ snapshotId: 'D' });
});

it('exposes 422 without legacy fallback and refreshes a stale single review before a new click', async () => {
  await mount();
  respondToPatch = async () => {
    rows = [
      { ...row(), reviewStatus: 'pending_audit', frontier: { ...row().frontier, reviewStatus: 'pending_audit' } },
    ];
    return Response.json({ code: 'MODERATION_CONFLICT' }, { status: 409 });
  };
  await click('Send to manual');
  expect(requests[0].body).toEqual({
    action: 'send_to_manual',
    snapshotId: 'B',
    expectedReviewStatus: 'pending_openai',
  });
  expect(host.textContent).toContain('Conflict:');
  expect([...host.querySelectorAll('.inspector button')].map((button) => button.textContent)).not.toContain(
    'Send to manual',
  );
  expect(requests).toHaveLength(1);
  respondToPatch = async () => Response.json({ code: 'VALIDATION_ERROR' }, { status: 422 });
  await click('Reject');
  expect(requests[1].body).toEqual({ action: 'reject', snapshotId: 'B', expectedReviewStatus: 'pending_audit' });
  expect(host.textContent).toContain('Contract mismatch (422)');
  expect(requests).toHaveLength(2);
});

it('browses hidden comment and image reports without queue dates, pages, and resets after clearing', async () => {
  const hidden = {
    ...row(),
    status: 'stale' as const,
    reviewStatus: 'rejected' as const,
    frontier: { ...row().frontier, reviewStatus: 'rejected' as const },
    publicSnapshotId: null,
    publicSnapshot: null,
    reportSnapshotId: 'B',
    authorDeletedAt: '2026-10-01',
  };
  rows = [hidden];
  nextOffset = 100;
  await mount();
  await click('Retained reports');
  expect(reads.at(-1)!.searchParams.get('mode')).toBe('reports');
  expect(reads.at(-1)!.searchParams.has('from')).toBe(false);
  expect(reads.at(-1)!.searchParams.has('status')).toBe(false);
  expect(reads.at(-1)!.searchParams.get('limit')).toBe('100');
  expect(host.textContent).toContain('Hidden: no currently public version.');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Approve');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Reject');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Disable submission');
  rows = [{ ...hidden, id: 'hidden-image', kind: 'image' }];
  nextOffset = null;
  await click('Next report page');
  expect(reads.at(-1)!.searchParams.get('offset')).toBe('100');
  await click('Clear flags');
  expect(requests[0].url.pathname).toContain('/hidden-image/');
  expect(requests[0].body).toEqual({ action: 'clear_flags', snapshotId: 'B' });
  expect(reads.at(-1)!.searchParams.get('offset')).toBe('0');
  expect(host.textContent).toContain('Offset 0.');
});

it('loads a retained deep link independently of dates and keeps rejected and disabled facts distinct', async () => {
  window.history.replaceState(null, '', '/?submissionId=old');
  rows = [
    {
      ...row('old'),
      status: 'stale',
      reviewStatus: 'approved',
      frontier: { ...row().frontier, reviewStatus: 'approved' },
      publicSnapshotId: null,
      publicSnapshot: null,
      adminDeletedAt: '2020-01-01',
      adminDeletedBy: 'reviewer',
    },
  ];
  await mount();
  expect([...reads[0].searchParams]).toEqual([
    ['submissionId', 'old'],
    ['limit', '1'],
  ]);
  expect(host.textContent).toContain('reviewer');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Approve');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Reject');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Disable submission');
  expect(host.textContent).not.toContain('Restore');
});

it('captures disable on B separately from review and shows both image versions', async () => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:test-image';
      }
      static revokeObjectURL() {}
    },
  );
  rows = [
    {
      ...row('image'),
      kind: 'image',
      filePath: 'images/B.webp',
      frontier: { ...row().frontier, filePath: 'images/B.webp' },
      publicSnapshot: { ...row().publicSnapshot!, filePath: 'images/A.webp' },
    },
  ];
  await mount();
  expect(host.querySelectorAll('.inspector img')).toHaveLength(2);
  expect(reads.map((url) => url.pathname)).toContain('/api/uploads/v1/file/images/A.webp');
  expect(reads.map((url) => url.pathname)).toContain('/api/uploads/v1/file/images/B.webp');
  await click('Disable submission');
  expect(requests[0].body).toEqual({ action: 'disable', snapshotId: 'B' });
});

it('does not substitute the frontier when the server omits its report target', async () => {
  rows[0].reportSnapshotId = undefined as unknown as string;
  respondToPatch = async () => Response.json({ code: 'VALIDATION_ERROR' }, { status: 422 });
  await mount();
  await click('Clear flags');
  expect(requests[0].body).toEqual({ action: 'clear_flags' });
  expect(host.textContent).toContain('Contract mismatch (422)');
});

it('keeps a pending click bound to its original row while the inspector selection changes', async () => {
  rows = [row('one'), { ...row('two'), snapshotId: 'C', frontier: { ...row().frontier, snapshotId: 'C' } }];
  let finish: (response: Response) => void = () => {};
  respondToPatch = async () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await mount();
  await click('Approve');
  await act(async () => {
    (host.querySelectorAll('.queue-main')[1] as HTMLButtonElement).click();
  });
  expect(host.querySelector('.inspector')!.textContent).toContain('Frontier snapshotC');
  expect(requests).toHaveLength(1);
  expect(requests[0].url.pathname).toContain('/one/');
  expect(requests[0].body).toEqual({ action: 'approve', snapshotId: 'B', expectedReviewStatus: 'pending_openai' });
  await act(async () => {
    finish(Response.json({ ok: true, actorUserId: 'admin', outcome: 'committed' }));
  });
  await flush();
  expect(requests).toHaveLength(1);
});

it('requires a fresh read after a failed conflict refresh instead of offering stale actions', async () => {
  await mount();
  const fetchBefore = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Response.json({ code: 'MODERATION_CONFLICT' }, { status: 409 });
      if (String(input).includes('/pending')) return Response.json({ code: 'UNAVAILABLE' }, { status: 503 });
      return fetchBefore(input, init);
    }),
  );
  await click('Approve');
  expect(host.textContent).toContain('Queue refresh failed');
  expect(host.querySelector('.inspector')!.textContent).not.toContain('Approve');
});
