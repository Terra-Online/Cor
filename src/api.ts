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

export type PendingSubmission = {
  id: string;
  markerId: string;
  poiHash: string;
  poiType: string;
  snapshotId: string;
  userId: string;
  content: string | null;
  filePath: string;
  status: ModerationStatus;
  moderationNote: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
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

type ApiErrorPayload = {
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

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

export const API_BASE = (import.meta.env.VITE_API_BASE || defaultApiBase()).replace(/\/$/, '');

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

export async function listPendingSubmissions(statuses?: ModerationStatus[]): Promise<PendingSubmission[]> {
  const params = new URLSearchParams();
  if (statuses && statuses.length > 0) {
    params.set('status', statuses.join(','));
  }
  params.set('limit', '500');
  const response = await fetch(`${API_BASE}/moderation/v1/pending?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as { items?: PendingSubmission[] };
  return payload.items ?? [];
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
  const response = await fetch(`${API_BASE}/moderation/v1/run-once`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw await toApiError(response);
  const payload = await response.json() as { processed?: number };
  return payload.processed ?? 0;
}

export async function runModerationSelected(ids: string[]): Promise<number> {
  const response = await fetch(`${API_BASE}/moderation/v1/run-selected`, {
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

function defaultApiBase(): string {
  if (import.meta.env.PROD) {
    return 'https://api.opendfieldmap.org';
  }
  return 'http://localhost:8787';
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
