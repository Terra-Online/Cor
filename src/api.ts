export type AdminUser = {
  uid: string;
  role: string;
  email?: string;
  nickname?: string;
};

export type ModerationStatus = 'pending_openai' | 'pending_audit' | 'active' | 'flagged' | 'remove_request' | 'stale';
export const MODERATION_STATUSES: ModerationStatus[] = [
  'pending_openai',
  'pending_audit',
  'active',
  'flagged',
  'remove_request',
  'stale',
];
export const MODERATION_DATE_FETCH_LIMIT = 10000;

export type PendingSubmission = {
  id: string;
  kind: 'image' | 'comment';
  markerId: string;
  poiHash: string;
  poiType: string;
  snapshotId: string;
  userId: string;
  content: string | null;
  filePath: string | null;
  status: ModerationStatus;
  flagCount?: number;
  moderationNote: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  parentId: string | null;
  commentDepth: number;
  submitter: {
    uid: string;
    uidNumber: number | null;
    publicUid: string | null;
    role: string | null;
    karma: number | null;
    nickname: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionImage = {
  id: string;
  markerId: string;
  url: string;
  content: string | null;
  author: {
    nickname: string;
    publicUid: string;
  } | null;
  status: ModerationStatus;
  upvoteCount: number;
  flagCount: number;
  upvoted?: boolean;
  flagged?: boolean;
  createdAt: string;
};

export type DuplicateImageMarker = {
  markerId: string;
  poiHash: string;
  poiType: string;
  imageCount: number;
  latestCreatedAt: string;
  latestImage: SubmissionImage | null;
};

export type ReviewSubmissionStats = {
  total: number;
  byType: { type: string; count: number }[];
  byStatus: { status: ModerationStatus; count: number }[];
};

export type ListPendingSubmissionsOptions = {
  statuses?: ModerationStatus[];
  from?: string;
  to?: string;
  limit?: number;
};

type ApiErrorPayload = {
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type SubmissionImagePayload = Omit<SubmissionImage, 'flagCount'> & {
  flagCount?: number | string | null;
  flag_count?: number | string | null;
  flagsCount?: number | string | null;
};

function normalizeFlagCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

function normalizeSubmissionImage(image: SubmissionImagePayload): SubmissionImage {
  return {
    ...image,
    flagCount: normalizeFlagCount(image.flagCount ?? image.flag_count ?? image.flagsCount),
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_API_BASE = 'http://localhost:8787';
const PROD_API_BASE = 'https://api.opendfieldmap.org';
const ADMIN_HOSTNAME = 'admin.opendfieldmap.org';

export const API_BASE = resolveApiBase().replace(/\/$/, '');

export async function getSession(): Promise<AdminUser | null> {
  const response = await fetch(`${API_BASE}/auth/v1/session`, {
    credentials: 'include',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as { user?: AdminUser };
  return payload.user ?? null;
}

export async function startGoogleSignIn(callbackURL: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/v1/sign-in/social`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'google',
      callbackURL,
      disableRedirect: true,
    }),
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as { url?: string; data?: { url?: string } };
  const redirectUrl = payload.url || payload.data?.url;
  if (!redirectUrl) {
    throw new ApiClientError('OAuth redirect URL missing.', 502, 'OAUTH_REDIRECT_MISSING');
  }
  return redirectUrl;
}

export async function listPendingSubmissions(options: ListPendingSubmissionsOptions = {}): Promise<{
  items: PendingSubmission[];
  stats: ReviewSubmissionStats | null;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (options.statuses && options.statuses.length > 0) {
    params.set('status', options.statuses.join(','));
  }
  if (options.from) {
    params.set('from', options.from);
  }
  if (options.to) {
    params.set('to', options.to);
  }
  params.set('limit', String(options.limit ?? MODERATION_DATE_FETCH_LIMIT));
  const response = await fetch(`${API_BASE}/moderation/v1/pending?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as {
    items?: (PendingSubmission & {
      flagCount?: number | string | null;
      flag_count?: number | string | null;
      flagsCount?: number | string | null;
    })[];
    stats?: ReviewSubmissionStats;
    limit?: number;
  };
  return {
    items: (payload.items ?? []).map((item) => ({
      ...item,
      ...(item.flagCount !== undefined || item.flag_count !== undefined || item.flagsCount !== undefined
        ? { flagCount: normalizeFlagCount(item.flagCount ?? item.flag_count ?? item.flagsCount) }
        : {}),
    })),
    stats: payload.stats ?? null,
    limit: payload.limit ?? options.limit ?? MODERATION_DATE_FETCH_LIMIT,
  };
}

export async function listDuplicateImageMarkers(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<{
  items: DuplicateImageMarker[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(`${API_BASE}/moderation/v1/images/duplicates?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as {
    items?: (Omit<DuplicateImageMarker, 'latestImage'> & {
      latestImage?: SubmissionImagePayload | null;
    })[];
    total?: number;
    limit?: number;
    offset?: number;
  };
  return {
    items: (payload.items ?? []).map((item) => ({
      ...item,
      latestImage: item.latestImage ? normalizeSubmissionImage(item.latestImage) : null,
    })),
    total: payload.total ?? 0,
    limit: payload.limit ?? limit,
    offset: payload.offset ?? offset,
  };
}

export async function listDuplicateMarkerImages(markerId: string, options: {
  limit?: number;
  offset?: number;
} = {}): Promise<{
  markerId: string;
  items: SubmissionImage[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(`${API_BASE}/moderation/v1/images/duplicates/${encodeURIComponent(markerId)}?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as {
    markerId?: string;
    items?: SubmissionImagePayload[];
    total?: number;
    limit?: number;
    offset?: number;
  };
  return {
    markerId: payload.markerId ?? markerId,
    items: (payload.items ?? []).map(normalizeSubmissionImage),
    total: payload.total ?? 0,
    limit: payload.limit ?? limit,
    offset: payload.offset ?? offset,
  };
}

export async function updateSubmissionStatus(
  id: string,
  status: ModerationStatus,
  moderationNote?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/moderation/v1/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status,
      moderationNote,
    }),
  });
  if (!response.ok) throw await toApiError(response);
}

export async function deleteTestImages(): Promise<{ deletedObjects: number; deletedRows: number }> {
  const response = await fetch(`${API_BASE}/moderation/v1/test-images`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  return await response.json() as { deletedObjects: number; deletedRows: number };
}

export async function deleteStaleImages(): Promise<{ deletedObjects: number; deletedRows: number }> {
  const response = await fetch(`${API_BASE}/moderation/v1/stale`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  return await response.json() as { deletedObjects: number; deletedRows: number };
}

export async function runModerationOnce(): Promise<number> {
  const response = await fetch(`${API_BASE}/moderation/v1/run`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as { processed?: number };
  return payload.processed ?? 0;
}

export async function runModerationSelected(ids: string[]): Promise<number> {
  const response = await fetch(`${API_BASE}/moderation/v1/run`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as { processed?: number };
  return payload.processed ?? 0;
}

export async function fetchImageBlobUrl(filePath: string): Promise<string> {
  const response = await fetch(`${API_BASE}/uploads/v1/file/${encodeObjectPath(filePath)}`, {
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  return URL.createObjectURL(await response.blob());
}

function resolveApiBase(): string {
  const hostname = currentHostname();

  if (LOCAL_HOSTNAMES.has(hostname)) {
    return LOCAL_API_BASE;
  }

  if (hostname === ADMIN_HOSTNAME) {
    return PROD_API_BASE;
  }

  const configured = import.meta.env.VITE_API_BASE?.trim();
  if (configured) {
    return configured;
  }

  if (import.meta.env.PROD) {
    return PROD_API_BASE;
  }

  return LOCAL_API_BASE;
}

function currentHostname(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.hostname.trim().toLowerCase();
}

async function toApiError(response: Response): Promise<ApiClientError> {
  try {
    const payload = await response.json() as ApiErrorPayload;
    const code = payload.code || payload.error?.code || `HTTP_${response.status}`;
    const message = payload.message || payload.error?.message || code;
    return new ApiClientError(message, response.status, code);
  } catch {
    return new ApiClientError(`HTTP ${response.status}`, response.status, `HTTP_${response.status}`);
  }
}

function encodeObjectPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
