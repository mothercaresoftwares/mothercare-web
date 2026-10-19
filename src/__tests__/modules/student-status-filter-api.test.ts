import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression guard for the student active/deactivated split.
 *
 * The Deactivated page asks the API for `status: 'inactive'`. The page-level
 * tests mock `@/lib/api` wholesale, so they can never catch the param being
 * dropped on the way to the network — which is exactly how the Deactivated
 * page ended up rendering the ACTIVE roster. These tests exercise the real
 * api client and assert on the request URL that actually leaves the browser.
 */
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [], meta: { total: 0 } }),
  });
  vi.stubGlobal('fetch', mockFetch);
  const store: Record<string, string> = { token: 'test-jwt' };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => {},
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

async function loadApi() {
  vi.resetModules();
  const mod = await import('@/lib/api');
  return mod.api;
}

function requestedUrl(): string {
  return mockFetch.mock.calls[0][0] as string;
}

describe('api.getStudents — status filter is sent to the API', () => {
  it('sends status=inactive for the deactivated roster', async () => {
    const api = await loadApi();
    await api.getStudents({ status: 'inactive', page: 1, limit: 20 });
    const url = requestedUrl();
    expect(url).toContain('/admin/students?');
    expect(url).toContain('status=inactive');
  });

  it('sends status=active for the active roster', async () => {
    const api = await loadApi();
    await api.getStudents({ status: 'active', limit: -1 });
    expect(requestedUrl()).toContain('status=active');
  });

  it('sends status=all when explicitly requested', async () => {
    const api = await loadApi();
    await api.getStudents({ status: 'all' });
    expect(requestedUrl()).toContain('status=all');
  });

  it('omits status entirely when not requested', async () => {
    const api = await loadApi();
    await api.getStudents({ groupId: 'g-1' });
    expect(requestedUrl()).not.toContain('status=');
  });

  it('keeps status alongside the other scope params', async () => {
    const api = await loadApi();
    await api.getStudents({ status: 'inactive', search: 'ahmed', groupId: 'g-1', page: 2, limit: 20 });
    const url = requestedUrl();
    expect(url).toContain('status=inactive');
    expect(url).toContain('search=ahmed');
    expect(url).toContain('groupId=g-1');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=20');
  });
});
