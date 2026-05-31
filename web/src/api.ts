import type {
  AppConfig,
  GapsResponse,
  GapQuery,
  LifeListSummary,
  TripPlannerResponse,
} from '@gap/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function getConfig(): Promise<AppConfig> {
  return json<AppConfig>(await fetch('/api/config'));
}

/** Returns null when no life list is loaded yet (204). */
export async function getLifeList(): Promise<LifeListSummary | null> {
  const res = await fetch('/api/lifelist');
  if (res.status === 204) return null;
  return json<LifeListSummary>(res);
}

export async function uploadLifeList(file: File): Promise<LifeListSummary> {
  const form = new FormData();
  form.append('file', file);
  return json<LifeListSummary>(await fetch('/api/lifelist', { method: 'POST', body: form }));
}

export async function clearLifeList(): Promise<void> {
  await fetch('/api/lifelist', { method: 'DELETE' });
}

export async function getGaps(q: GapQuery, signal?: AbortSignal): Promise<GapsResponse> {
  const params = new URLSearchParams({
    lat: String(q.lat),
    lng: String(q.lng),
    distKm: String(q.distKm),
    backDays: String(q.backDays),
    source: q.source,
    scope: q.scope,
  });
  return json<GapsResponse>(await fetch(`/api/gaps?${params}`, { signal }));
}

export async function getTripPlan(q: GapQuery, signal?: AbortSignal): Promise<TripPlannerResponse> {
  const params = new URLSearchParams({
    lat: String(q.lat),
    lng: String(q.lng),
    distKm: String(q.distKm),
    backDays: String(q.backDays),
    scope: q.scope,
  });
  return json<TripPlannerResponse>(await fetch(`/api/trip-planner?${params}`, { signal }));
}
