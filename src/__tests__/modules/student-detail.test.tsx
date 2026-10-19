import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../helpers/test-utils';
import userEvent from '@testing-library/user-event';

const mockGetStudent = vi.hoisted(() => vi.fn());
const mockGetSectionSubjects = vi.hoisted(() => vi.fn());
const mockGetStudentSchoolTenures = vi.hoisted(() => vi.fn());
const mockGetSections = vi.hoisted(() => vi.fn());
const mockUpdateStudent = vi.hoisted(() => vi.fn());
const mockDeactivateStudent = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 's-1' }),
  usePathname: () => '/admin/students/s-1',
}));

vi.mock('@/lib/api', () => ({
  api: {
    getStudent: mockGetStudent,
    updateStudent: mockUpdateStudent,
    getSectionSubjects: mockGetSectionSubjects,
    getStudentSchoolTenures: mockGetStudentSchoolTenures,
    getSections: mockGetSections,
    deactivateStudent: mockDeactivateStudent,
  },
  apiRequest: mockApiRequest,
}));

vi.mock('@/components/toast', () => ({ showToast: vi.fn() }));

const localStorageMock = (() => {
  const store: Record<string, string> = { token: 'test-jwt', activeBranchId: 'b-1', activeAYId: 'ay-1' };
  return { getItem: (k: string) => store[k] || null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const baseStudent = {
  id: 's-1', name: 'Ali Hassan', rollNumber: '012', admissionNumber: 'MCS-2026-0042',
  dateOfBirth: '2014-01-15T00:00:00.000Z', gender: 'male', bloodGroup: 'B+',
  religion: 'Islam', nationality: 'Pakistani', phone: '+92 300', studentEmail: 'a@b.com',
  studentWhatsapp: '+92 300', address: 'Street 5', city: 'Islamabad', country: 'Pakistan',
  postalCode: '44000', bformCnic: '12345', motherTongue: 'Urdu',
  previousSchool: 'IPS', previousClass: 'Class 4', tcNumber: 'TC-001', referredBy: 'Mr. X',
  status: 'ACTIVE', profilePhotoId: null, groupId: 'g-5',
  group: { name: 'Class 5', section: 'A' },
  parents: [{ id: 'sp-1', relation: 'Father', isPrimary: true, parent: {
    id: 'p-1', userId: 'u-1', occupation: 'Business', employerName: 'Co',
    maritalStatus: 'Married', monthlyIncome: 'above_20k', phone: '+92', whatsapp: '+92',
    email: 'p@e.com', cnicNumber: '12345',
    user: { id: 'u-1', name: 'Mr. Parent', phone: '+92' },
  } }],
  emergencyContacts: [{ id: 'ec-1', name: 'Mother', relationship: 'Mother', phone: '+92 300', whatsapp: null }],
  healthRecord: { id: 'hr-1', bloodGroup: 'B+', hasChronicDisease: true, diseaseDetails: 'Asthma', allergies: 'Dust', disability: null, medicalNotes: 'Use inhaler', doctorName: 'Dr. A', doctorPhone: '+92' },
  enrollments: [],
};

const mockSubjects = [
  { id: 'sub-1', name: 'Mathematics', code: 'MATH' },
  { id: 'sub-2', name: 'English', code: 'ENG' },
  { id: 'sub-3', name: 'Urdu', code: null },
];

import StudentDetailPage from '@/app/admin/students/[id]/page';

describe('StudentDetailPage — header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudent.mockResolvedValue({ success: true, data: baseStudent });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
    mockGetStudentSchoolTenures.mockResolvedValue({ data: [] });
    mockGetSections.mockResolvedValue({ success: true, data: [] });
  });

  it('shows student name', async () => {
    render(<StudentDetailPage />);
    const names = await screen.findAllByText('Ali Hassan');
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it('shows roll number', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Roll No: 012')).toBeInTheDocument();
  });

  it('shows class badge', async () => {
    render(<StudentDetailPage />);
    const badges = await screen.findAllByText('Class 5 — A');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows status', async () => { render(<StudentDetailPage />); const statuses = await screen.findAllByText('ACTIVE'); expect(statuses.length).toBeGreaterThanOrEqual(1); });
});

describe('StudentDetailPage — 7 sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudent.mockResolvedValue({ success: true, data: baseStudent });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
    mockGetStudentSchoolTenures.mockResolvedValue({ data: [] });
    mockGetSections.mockResolvedValue({ success: true, data: [] });
  });

  it('renders all 7 section headers', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Student Information')).toBeInTheDocument();
    expect(await screen.findByText('Student Contact (Optional)')).toBeInTheDocument();
    expect(await screen.findByText('Parent / Guardian')).toBeInTheDocument();
    const addrs = await screen.findAllByText('Address'); expect(addrs.length).toBeGreaterThanOrEqual(1);
    const ecs = await screen.findAllByText('Emergency Contact'); expect(ecs.length).toBeGreaterThanOrEqual(1);
    const healths = await screen.findAllByText('Health & Medical'); expect(healths.length).toBeGreaterThanOrEqual(1);
    const prevs = await screen.findAllByText('Previous Education'); expect(prevs.length).toBeGreaterThanOrEqual(1);
  });

  it('shows 12 student info fields', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Full Name')).toBeInTheDocument();
    expect(await screen.findByText('Date of Birth')).toBeInTheDocument();
    expect(await screen.findByText('Roll No')).toBeInTheDocument();
    expect(await screen.findByText('Religion')).toBeInTheDocument();
    expect(await screen.findByText('Nationality')).toBeInTheDocument();
    expect(await screen.findByText('Gender')).toBeInTheDocument();
    expect(await screen.findByText('B-Form / CNIC')).toBeInTheDocument();
    expect(await screen.findByText('Admission No.')).toBeInTheDocument();
    expect(await screen.findByText('Admission Date')).toBeInTheDocument();
    expect(await screen.findByText('Class')).toBeInTheDocument();
    expect(await screen.findByText('Section')).toBeInTheDocument();
    expect(await screen.findByText('Mother Tongue')).toBeInTheDocument();
  });

  it('shows subjects heading', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Subjects')).toBeInTheDocument();
  });

  it('shows contact section', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Student Contact (Optional)')).toBeInTheDocument();
    expect(await screen.findByText('a@b.com')).toBeInTheDocument();
  });

  it('shows parent section with 10 fields', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Parent / Guardian')).toBeInTheDocument();
    expect(await screen.findByText('Business')).toBeInTheDocument();
  });

  it('shows address with country', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Street 5')).toBeInTheDocument();
    expect(await screen.findByText('Islamabad')).toBeInTheDocument();
    expect(await screen.findByText('Pakistan')).toBeInTheDocument();
    expect(await screen.findByText('44000')).toBeInTheDocument();
  });

  it('shows emergency contact', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Emergency Contact')).toBeInTheDocument();
  });

  it('shows health section', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('Health & Medical')).toBeInTheDocument();
    expect(await screen.findByText('Asthma')).toBeInTheDocument();
    expect(await screen.findByText('Dust')).toBeInTheDocument();
    expect(await screen.findByText('Use inhaler')).toBeInTheDocument();
  });

  it('shows previous education', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByText('IPS')).toBeInTheDocument();
    expect(await screen.findByText('Class 4')).toBeInTheDocument();
    expect(await screen.findByText('TC-001')).toBeInTheDocument();
    expect(await screen.findByText('Mr. X')).toBeInTheDocument();
  });
});

describe('StudentDetailPage — conditional buttons', () => {
  it('shows Edit on student info (always)', async () => {
    mockGetStudent.mockResolvedValue({ success: true, data: baseStudent });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
    render(<StudentDetailPage />);
    const edits = await screen.findAllByText('Edit');
    expect(edits.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Add on contact when empty', async () => {
    const noContact = { ...baseStudent, phone: null, studentEmail: null, studentWhatsapp: null };
    mockGetStudent.mockResolvedValue({ success: true, data: noContact });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: [] });
    render(<StudentDetailPage />);
    const adds = await screen.findAllByText('Add');
    expect(adds.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Edit buttons', async () => {
    mockGetStudent.mockResolvedValue({ success: true, data: baseStudent });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: [] });
    render(<StudentDetailPage />);
    const editBtns = await screen.findAllByText('Edit');
    expect(editBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows loading state', () => {
    mockGetStudent.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<StudentDetailPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state', async () => {
    mockGetStudent.mockRejectedValue(new Error('Not found'));
    render(<StudentDetailPage />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});

describe('StudentDetailPage — section modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudent.mockResolvedValue({ success: true, data: baseStudent });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
  });

  it('opens student info edit modal', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[0]);
    expect(await screen.findByText('Edit Student')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Ali Hassan')).toBeInTheDocument();
  });

  it('opens contact edit modal', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[1]);
    expect(await screen.findByText('Student Contact')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('a@b.com')).toBeInTheDocument();
  });

  it('opens address edit modal [3]', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[3]);
    expect(await screen.findByDisplayValue('Street 5')).toBeInTheDocument();
  });

  it('opens parent edit modal', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[2]);
    expect(await screen.findByText('Save')).toBeInTheDocument(); // modal has Save button
  });

  it('opens health record modal [5]', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[5]);
    expect(await screen.findByText('Save')).toBeInTheDocument();
  });

  it('opens previous education modal [6]', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[6]);
    expect(await screen.findByText('Save')).toBeInTheDocument();
  });

  it('opens emergency contact modal', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[4]);
    expect(await screen.findByText('Save')).toBeInTheDocument();
  });

  it('address edit changes propagate correctly', async () => {
    render(<StudentDetailPage />);
    await userEvent.setup().click((await screen.findAllByText('Edit'))[3]);
    const input = await screen.findByDisplayValue('Street 5');
    await userEvent.clear(input);
    await userEvent.type(input, 'New Address');
    await userEvent.setup().click(await screen.findByText('Save'));
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.stringContaining('/admin/students/s-1'),
      expect.objectContaining({ method: 'PUT' })
    );
  });
});

describe('StudentDetailPage — parent save endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudent.mockResolvedValue({ success: true, data: { ...baseStudent, parents: [] } });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
    mockGetStudentSchoolTenures.mockResolvedValue({ data: [] });
    mockGetSections.mockResolvedValue({ success: true, data: [] });
    mockApiRequest.mockResolvedValue({ success: true, data: {} });
  });

  it('saves a first-time parent to the singular /parent endpoint (never PUT /parents)', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);
    // No parents linked → section button reads "Add".
    await user.click(await screen.findByText('Add'));
    await user.click(await screen.findByText('Save'));
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/admin/students/s-1/parent',
      expect.objectContaining({ method: 'PUT' }),
    );
    const urls = mockApiRequest.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u === '/admin/students/s-1/parents')).toBe(false);
  });

  it('saves a first-time emergency contact via POST (never PUT without :contactId)', async () => {
    vi.clearAllMocks();
    mockGetStudent.mockResolvedValue({ success: true, data: { ...baseStudent, emergencyContacts: [] } });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
    mockGetStudentSchoolTenures.mockResolvedValue({ data: [] });
    mockGetSections.mockResolvedValue({ success: true, data: [] });
    mockApiRequest.mockResolvedValue({ success: true, data: {} });
    const user = userEvent.setup();
    render(<StudentDetailPage />);
    // No contacts linked → section button reads "Add".
    await user.click(await screen.findByText('Add'));
    await user.click(await screen.findByText('Save'));
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/admin/students/s-1/emergency-contact',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('StudentDetailPage — deactivate (replaces direct delete)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStudent.mockResolvedValue({ success: true, data: baseStudent });
    mockGetSectionSubjects.mockResolvedValue({ success: true, data: mockSubjects });
    mockGetStudentSchoolTenures.mockResolvedValue({ data: [] });
    mockGetSections.mockResolvedValue({ success: true, data: [] });
    mockDeactivateStudent.mockResolvedValue({ success: true });
  });

  it('active student shows a Deactivate button (no direct Delete)', async () => {
    render(<StudentDetailPage />);
    expect(await screen.findByRole('button', { name: /deactivate student/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete student/i })).not.toBeInTheDocument();
  });

  it('deactivate calls the deactivate endpoint', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);
    await user.click(await screen.findByRole('button', { name: /deactivate student/i }));
    // Confirmation now goes through the custom modal, not window.confirm.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/deactivate/i);
    expect(mockDeactivateStudent).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(mockDeactivateStudent).toHaveBeenCalledWith('s-1'));
  });

  it('withdrawn student shows guidance instead of a delete action', async () => {
    mockGetStudent.mockResolvedValue({ success: true, data: { ...baseStudent, status: 'WITHDRAWN' } });
    render(<StudentDetailPage />);
    expect(await screen.findByText(/deactivated page/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate student/i })).not.toBeInTheDocument();
  });
});
