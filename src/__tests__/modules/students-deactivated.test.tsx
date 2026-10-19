import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../helpers/test-utils';
import userEvent from '@testing-library/user-event';

const mockGetStudents = vi.hoisted(() => vi.fn());
const mockReactivateStudent = vi.hoisted(() => vi.fn());
const mockDeleteStudent = vi.hoisted(() => vi.fn());
const mockDeactivateStudent = vi.hoisted(() => vi.fn());
const mockGetSections = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/students/deactivated',
}));

vi.mock('@/lib/api', () => ({
  api: {
    getStudents: mockGetStudents,
    reactivateStudent: mockReactivateStudent,
    deleteStudent: mockDeleteStudent,
    deactivateStudent: mockDeactivateStudent,
    getSections: mockGetSections,
  },
}));

const localStorageMock = (() => {
  const store: Record<string, string> = { token: 'test-jwt', activeBranchId: 'b1', activeAYId: 'ay1' };
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => {},
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import DeactivatedStudentsPage from '@/app/admin/students/deactivated/page';

const mockInactiveStudents = [
  {
    id: 's1', name: 'Ali Khan', admissionNumber: 'ADM-1', rollNumber: '1',
    status: 'WITHDRAWN',
    group: { id: 'g1', name: 'Class 5', section: 'A' },
    _count: { enrollments: 0 },
  },
  {
    id: 's2', name: 'Sara Ahmed', admissionNumber: 'ADM-2', rollNumber: '2',
    status: 'SUSPENDED',
    group: { id: 'g2', name: 'Class 4', section: null },
    _count: { enrollments: 3 },
  },
];

describe('DeactivatedStudentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReactivateStudent.mockResolvedValue({ success: true });
    mockDeleteStudent.mockResolvedValue({ success: true });
  });

  it('requests only inactive students', async () => {
    mockGetStudents.mockResolvedValue({
      success: true, data: mockInactiveStudents,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    render(<DeactivatedStudentsPage />);
    await screen.findByText('Ali Khan');
    expect(mockGetStudents).toHaveBeenCalledWith(expect.objectContaining({ status: 'inactive' }));
  });

  it('shows inactive students with their status badges', async () => {
    mockGetStudents.mockResolvedValue({
      success: true, data: mockInactiveStudents,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    render(<DeactivatedStudentsPage />);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText('Sara Ahmed')).toBeInTheDocument();
    expect(screen.getByText(/withdrawn/i)).toBeInTheDocument();
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
  });

  it('reactivates through the confirm flow', async () => {
    mockGetStudents.mockResolvedValue({
      success: true, data: mockInactiveStudents,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    const user = userEvent.setup();
    render(<DeactivatedStudentsPage />);
    await screen.findByText('Ali Khan');

    await user.click(screen.getAllByTitle('Reactivate student')[0]);
    expect(await screen.findByText('Reactivate "Ali Khan"?')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const { within } = await import('@testing-library/react');
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    expect(mockReactivateStudent).toHaveBeenCalledWith('s1');
  });

  it('offers permanent delete only for students with no enrollment history', async () => {
    mockGetStudents.mockResolvedValue({
      success: true, data: mockInactiveStudents,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    render(<DeactivatedStudentsPage />);
    await screen.findByText('Ali Khan');
    // Only Ali (0 enrollments) gets the ✕ delete button; Sara has 3.
    expect(screen.getAllByTitle('Delete permanently')).toHaveLength(1);
  });

  it('permanently deletes a history-less student through the confirm flow', async () => {
    mockGetStudents.mockResolvedValue({
      success: true, data: mockInactiveStudents,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    const user = userEvent.setup();
    render(<DeactivatedStudentsPage />);
    await screen.findByText('Ali Khan');

    await user.click(screen.getAllByTitle('Delete permanently')[0]);
    expect(await screen.findByText('Permanently Delete "Ali Khan"?')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const { within } = await import('@testing-library/react');
    await user.click(within(dialog).getByRole('button', { name: 'Delete Permanently' }));
    expect(mockDeleteStudent).toHaveBeenCalledWith('s1');
  });

  it('shows empty state when nobody is deactivated', async () => {
    mockGetStudents.mockResolvedValue({
      success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    render(<DeactivatedStudentsPage />);
    expect(await screen.findByText('No deactivated students.')).toBeInTheDocument();
  });
});
