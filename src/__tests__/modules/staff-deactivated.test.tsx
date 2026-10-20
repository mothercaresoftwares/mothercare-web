import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../helpers/test-utils';
import userEvent from '@testing-library/user-event';

const mockGetStaffList = vi.hoisted(() => vi.fn());
const mockReactivateStaffMember = vi.hoisted(() => vi.fn());
const mockDeleteStaffMember = vi.hoisted(() => vi.fn());
const mockShowToast = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/staff/deactivated',
}));

vi.mock('@/components/toast', () => ({ showToast: mockShowToast }));

vi.mock('@/lib/api', () => ({
  api: {
    getStaffList: mockGetStaffList,
    reactivateStaffMember: mockReactivateStaffMember,
    deleteStaffMember: mockDeleteStaffMember,
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

import DeactivatedStaffPage from '@/app/admin/staff/deactivated/page';

const mockInactiveStaff = [
  {
    userId: 'u1', branchMemberId: 'm1', name: 'Rubina Shaheen', username: 'rubina_fees',
    email: null, phone: '03001112222', status: 'inactive', branchRole: 'management',
    employeeId: 'STF-1', workRole: 'Accountant', qualification: 'B.Com', permissions: [],
  },
  {
    userId: 'u2', branchMemberId: 'm2', name: 'Ali Khan', username: 'worker_ali',
    email: null, phone: null, status: 'inactive', branchRole: 'worker',
    employeeId: 'STF-2', workRole: 'Guard', qualification: null, permissions: [],
  },
];

describe('DeactivatedStaffPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReactivateStaffMember.mockResolvedValue({ success: true });
    mockDeleteStaffMember.mockResolvedValue({ success: true });
  });
  it('requests only inactive staff', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: mockInactiveStaff, meta: { total: 2 } });
    render(<DeactivatedStaffPage />);
    await screen.findByText('Rubina Shaheen');
    expect(mockGetStaffList).toHaveBeenCalledWith(expect.objectContaining({ status: 'inactive' }));
  });

  it('shows inactive staff with their status badges', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: mockInactiveStaff, meta: { total: 2 } });
    render(<DeactivatedStaffPage />);
    expect(await screen.findByText('Rubina Shaheen')).toBeInTheDocument();
    expect(screen.getByText('Ali Khan')).toBeInTheDocument();
    // Both cards render their "inactive" status dot.
    expect(screen.getAllByText(/inactive/i).length).toBeGreaterThanOrEqual(2);
  });

  it('reactivates through the confirm flow', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: mockInactiveStaff, meta: { total: 2 } });
    const user = userEvent.setup();
    render(<DeactivatedStaffPage />);
    await screen.findByText('Rubina Shaheen');

    await user.click(screen.getAllByTitle('Reactivate staff')[0]);
    expect(await screen.findByText('Reactivate "Rubina Shaheen"?')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const { within } = await import('@testing-library/react');
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    expect(mockReactivateStaffMember).toHaveBeenCalledWith('u1');
  });

  it('offers permanent delete for every deactivated staff member', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: mockInactiveStaff, meta: { total: 2 } });
    render(<DeactivatedStaffPage />);
    await screen.findByText('Rubina Shaheen');
    // The backend guard is authoritative — the button is always offered.
    expect(screen.getAllByTitle('Delete permanently')).toHaveLength(2);
  });

  it('permanently deletes a staff member through the confirm flow', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: mockInactiveStaff, meta: { total: 2 } });
    const user = userEvent.setup();
    render(<DeactivatedStaffPage />);
    await screen.findByText('Rubina Shaheen');

    await user.click(screen.getAllByTitle('Delete permanently')[0]);
    expect(await screen.findByText('Permanently Delete "Rubina Shaheen"?')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const { within } = await import('@testing-library/react');
    await user.click(within(dialog).getByRole('button', { name: 'Delete Permanently' }));
    expect(mockDeleteStaffMember).toHaveBeenCalledWith('u1');
  });

  it('surfaces the backend guard message when deletion is refused', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: mockInactiveStaff, meta: { total: 2 } });
    mockDeleteStaffMember.mockRejectedValueOnce(
      new Error('Cannot delete: staff has attendance or payroll history. Keep them deactivated instead.'),
    );
    const user = userEvent.setup();
    render(<DeactivatedStaffPage />);
    await screen.findByText('Rubina Shaheen');

    await user.click(screen.getAllByTitle('Delete permanently')[0]);
    const dialog = screen.getByRole('dialog');
    const { within } = await import('@testing-library/react');
    await user.click(within(dialog).getByRole('button', { name: 'Delete Permanently' }));

    expect(mockShowToast).toHaveBeenCalledWith(
      'error',
      'Cannot delete: staff has attendance or payroll history. Keep them deactivated instead.',
    );
  });

  it('shows empty state when nobody is deactivated', async () => {
    mockGetStaffList.mockResolvedValue({ success: true, data: [], meta: { total: 0 } });
    render(<DeactivatedStaffPage />);
    expect(await screen.findByText('No deactivated staff.')).toBeInTheDocument();
  });
});
