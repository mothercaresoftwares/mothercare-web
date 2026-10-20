import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../helpers/test-utils';

const mockGetStudents = vi.hoisted(() => vi.fn());
const mockGetSections = vi.hoisted(() => vi.fn());
const mockShowToast = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/students',
}));

vi.mock('@/components/toast', () => ({ showToast: mockShowToast }));

vi.mock('@/lib/api', () => ({
  api: {
    getStudents: mockGetStudents,
    getSections: mockGetSections,
    deactivateStudent: vi.fn(),
  },
}));

const localStorageMock = (() => {
  let store: Record<string, string> = { token: 'test-jwt', activeBranchId: 'b-1', activeAYId: 'ay-1' };
  return { getItem: (key: string) => store[key] || null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; }, clear: () => { store = {}; } };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { AyPermissionsProvider } from '@/hooks/use-ay-permissions';
import StudentsPage from '@/app/admin/students/page';

const mockStudents = [
  { id: 's-1', name: 'Ali Hassan', rollNumber: '012', admissionNumber: 'MCS-2026-0042', status: 'ACTIVE', group: { name: 'Class 5', section: 'A' } },
];

function renderWithAy(academicYearId: string | null) {
  return render(
    <AyPermissionsProvider staffAccess={null} ayStatus="ACTIVE" academicYearId={academicYearId}>
      <StudentsPage />
    </AyPermissionsProvider>,
  );
}

describe('StudentsPage — academic year scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudents.mockImplementation((params: any) => {
      if (params?.status === 'inactive') {
        return Promise.resolve({ success: true, data: [], meta: { total: 0 } });
      }
      return Promise.resolve({ success: true, data: mockStudents, meta: { total: 1 } });
    });
    mockGetSections.mockResolvedValue({ success: true, data: [] });
  });

  it('loads the roster even before the academic year is resolved', async () => {
    renderWithAy(null);
    expect(await screen.findByText('Ali Hassan')).toBeInTheDocument();
  });

  it('reloads the roster when the academic year resolves', async () => {
    const { rerender } = renderWithAy(null);
    await screen.findByText('Ali Hassan');
    const callsBefore = mockGetStudents.mock.calls.length;

    rerender(
      <AyPermissionsProvider staffAccess={null} ayStatus="ACTIVE" academicYearId="ay-1">
        <StudentsPage />
      </AyPermissionsProvider>,
    );

    await waitFor(() => expect(mockGetStudents.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('reloads the roster when the academic year is switched', async () => {
    const { rerender } = renderWithAy('ay-1');
    await screen.findByText('Ali Hassan');
    const callsBefore = mockGetStudents.mock.calls.length;

    rerender(
      <AyPermissionsProvider staffAccess={null} ayStatus="ACTIVE" academicYearId="ay-2">
        <StudentsPage />
      </AyPermissionsProvider>,
    );

    await waitFor(() => expect(mockGetStudents.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe('StudentsPage — failed load is never silent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSections.mockResolvedValue({ success: true, data: [] });
  });

  it('shows an error banner instead of an empty roster when the request fails', async () => {
    mockGetStudents.mockImplementation((params: any) => {
      if (params?.status === 'inactive') {
        return Promise.resolve({ success: true, data: [], meta: { total: 0 } });
      }
      return Promise.reject(new Error('academicYearId does not belong to the specified branch'));
    });

    renderWithAy(null);

    expect(await screen.findByText(/does not belong to the specified branch/i)).toBeInTheDocument();
    // The empty state must NOT be shown — a failed load is not an empty roster.
    expect(screen.queryByText('No students found.')).not.toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith(
      'error',
      'academicYearId does not belong to the specified branch',
    );
  });

  it('shows an error banner when the API answers with success:false', async () => {
    mockGetStudents.mockImplementation((params: any) => {
      if (params?.status === 'inactive') {
        return Promise.resolve({ success: true, data: [], meta: { total: 0 } });
      }
      return Promise.resolve({ success: false, message: 'No academic year specified' });
    });

    renderWithAy(null);

    expect(await screen.findByText('No academic year specified')).toBeInTheDocument();
    expect(screen.queryByText('No students found.')).not.toBeInTheDocument();
  });
});
