import config from '@/config';
import { canteenQuery } from '@/lib/canteen';
import { clearAuthStorage, sanitizePostLoginRedirect } from '@/lib/teacher/auth-routing';
/**
 * Mother Care School — API Client
 *
 * Headers sent from the frontend:
 *   - x-publishable-api-key  (identifies this registered frontend)
 *   - Authorization: Bearer  (when user is logged in, takes priority)
 *
 * The secret key (sk_mcs_*) is for server-to-server / portal endpoints only.
 * It must NEVER be sent from client-side code.
 */
const PUB_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_KEY || '';

/** Standard JSON envelope from MCS API routes. */
export type ApiJsonResult<T = any> = {
  success: boolean;
  data: T;
  message?: string;
};

/** Build branch + academic year query params from localStorage. */
function buildScopeParams(extra?: Record<string, string | undefined>): URLSearchParams {
  const q = new URLSearchParams();
  if (typeof window !== 'undefined') {
    const branchId = localStorage.getItem('activeBranchId');
    const academicYearId = localStorage.getItem('activeAYId');
    if (academicYearId) q.set('academicYearId', academicYearId);
    if (branchId) q.set('branchId', branchId);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
    }
  }
  return q;
}

export function scopeQuery(extra?: Record<string, string | undefined>): string {
  const s = buildScopeParams(extra).toString();
  return s ? `?${s}` : '';
}

/**
 * Session-expiry handler — fires at most once per page lifetime.
 * Clears the dead JWT everywhere (localStorage + proxy cookie, which also
 * syncs other open tabs via their `storage` listeners) and sends the user
 * to /login, preserving a safe post-login redirect. Runs on ANY 401 from
 * ANY page/role, so an expired 7-day token always ends in a clean logout
 * instead of a broken half-logged-in shell.
 */
let expiredRedirectStarted = false;
export function handleExpiredSession(): void {
  if (typeof window === 'undefined') return;
  clearAuthStorage();
  if (expiredRedirectStarted) return;
  expiredRedirectStarted = true;
  const pathname = window.location.pathname;
  if (pathname === '/login' || pathname.startsWith('/login/')) return;
  const safe = sanitizePostLoginRedirect(pathname);
  window.location.href = safe ? `/login?redirect=${encodeURIComponent(safe)}` : '/login';
}

/** Merge branch + academic year from localStorage into a POST/PATCH body. */
export function scopeBody<T extends Record<string, unknown>>(body: T): T & { academicYearId?: string; branchId?: string } {
  if (typeof window === 'undefined') return body;
  const academicYearId = localStorage.getItem('activeAYId');
  const branchId = localStorage.getItem('activeBranchId');
  return {
    ...body,
    ...(academicYearId ? { academicYearId } : {}),
    ...(branchId ? { branchId } : {}),
  };
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Always send the publishable key to identify this frontend
  if (PUB_KEY) headers['x-publishable-api-key'] = PUB_KEY;

  // If user is logged in, attach JWT (takes priority over API keys)
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const hadToken = !!token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${config.apiUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    const hint =
      err instanceof TypeError && err.message === 'Failed to fetch'
        ? 'Unable to reach the server. Please check your internet connection and try again.'
        : err instanceof Error
          ? err.message
          : 'Network request failed';
    throw new Error(hint);
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && hadToken && !path.startsWith('/auth/')) {
    // Dead session (expired/revoked/deactivated): log out everywhere and
    // bounce to login instead of leaving a broken shell behind. Skips /auth/*
    // so failed logins and public invite links never nuke a live session,
    // and requires hadToken so public endpoints can't log anyone out.
    handleExpiredSession();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

// ─── Convenience methods ───────────────────────────────
export const api = {
  login: (identifier: string, password: string) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  me: () => apiRequest('/auth/me'),
  refresh: () => apiRequest('/auth/refresh', { method: 'POST' }),
  meBranches: () => apiRequest('/me/branches'),

  stats: () =>
    apiRequest(`/admin/stats${scopeQuery()}`),

  logout: () =>
    apiRequest('/auth/logout', { method: 'POST' }),

  // ─── Branches ────────────────────────────────────────
  getBranches: () =>
    apiRequest<ApiJsonResult<any[]>>('/admin/branches'),

  getBranch: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/branches/${id}`),

  createBranch: (data: { name: string; code: string; address?: string; phone?: string; email?: string }) =>
    apiRequest('/admin/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBranch: (id: string, data: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    teacherParentContactEnabled?: boolean;
    teachersCanMarkAttendance?: boolean;
    teachersCanEnterMarks?: boolean;
  }) =>
    apiRequest(`/admin/branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivateBranch: (id: string) =>
    apiRequest(`/admin/branches/${id}`, { method: 'DELETE' }),

  getBranchStats: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/branches/${id}/stats${scopeQuery()}`),

  getBranchChatSettings: (branchId: string) =>
    apiRequest<ApiJsonResult>(`/admin/branches/${branchId}/chat-settings`),

  updateBranchChatSettings: (
    branchId: string,
    academicYearId: string,
    data: {
      schoolAnnouncementPosterUserIds?: string[];
      teacherAnnouncementPosterUserIds?: string[];
      allowAllTeachersTeacherAnnouncement?: boolean;
    },
  ) => {
    const qs = new URLSearchParams({ branchId, academicYearId });
    return apiRequest(`/admin/branches/${branchId}/chat-settings?${qs}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getBranchTeachers: (branchId: string, params?: { search?: string; limit?: number }) => {
    const q = new URLSearchParams({ branchId });
    if (params?.search) q.set('search', params.search);
    q.set('limit', String(params?.limit ?? 200));
    return apiRequest<{ success: boolean; data: any[]; meta: any }>(`/admin/teachers?${q}`);
  },

  removeAdmin: (branchId: string, userId: string) =>
    apiRequest(`/admin/branches/${branchId}/remove-admin/${userId}`, { method: 'POST' }),

  // ─── Academic Calendars ──────────────────────────────
  getCalendars: () =>
    apiRequest<ApiJsonResult<any[]>>('/admin/calendars'),

  createCalendar: (data: { label: string; startDate: string; endDate: string; isCurrent?: boolean }) =>
    apiRequest('/admin/calendars', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ─── Academic Years ──────────────────────────────────
  getAcademicYears: (branchId: string, status?: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/academic-years${status ? `?status=${status}` : ''}`),

  getAcademicYear: (branchId: string, id: string) =>
    apiRequest<ApiJsonResult>(`/admin/branches/${branchId}/academic-years/${id}`),

  createAcademicYear: (branchId: string, data: { calendarId: string; previousAcademicYearId?: string; directToArchived?: boolean }) =>
    apiRequest(`/admin/branches/${branchId}/academic-years`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  publishAcademicYear: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${id}/publish`, { method: 'PATCH' }),

  archiveAcademicYear: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${id}/archive`, { method: 'PATCH' }),

  unarchiveAcademicYear: (branchId: string, id: string, target: 'BUILD_STAGE' | 'ON_HOLD' = 'BUILD_STAGE') =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${id}/unarchive`, {
      method: 'PATCH',
      body: JSON.stringify({ target }),
    }),

  pauseAcademicYear: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${id}/pause`, { method: 'PATCH' }),

  resumeAcademicYear: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${id}/resume`, { method: 'PATCH' }),

  deleteAcademicYear: (branchId: string, id: string, confirmLabel: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmLabel }),
    }),

  getAcademicYearDeletePreview: (branchId: string, id: string) =>
    apiRequest<ApiJsonResult>(`/admin/branches/${branchId}/academic-years/${id}/delete-preview`),

  getAcademicYearAuditLogs: (branchId: string, params?: { academicYearId?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.academicYearId) qs.set('academicYearId', params.academicYearId);
    if (params?.limit) qs.set('limit', String(params.limit));
    const tail = qs.toString();
    return apiRequest<ApiJsonResult<any[]>>(
      `/admin/branches/${branchId}/academic-year-audit-logs${tail ? `?${tail}` : ''}`,
    );
  },

  getPromotionPreconditions: (branchId: string, sourceAcademicYearId: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/branches/${branchId}/academic-years/${sourceAcademicYearId}/promotion/preconditions`,
    ),

  startBatchPromotion: (
    branchId: string,
    sourceAcademicYearId: string,
    data: { targetAcademicYearId?: string; calendarId?: string; carryOptions?: Record<string, boolean>; notes?: string },
  ) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${sourceAcademicYearId}/promotion/start`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  snapshotBatchPromotion: (branchId: string, sourceAcademicYearId: string, runId: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${sourceAcademicYearId}/promotion/runs/${runId}/snapshot`, {
      method: 'POST',
    }),

  updatePromotionCarry: (
    branchId: string,
    sourceAcademicYearId: string,
    runId: string,
    carryOptions: Record<string, boolean>,
  ) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${sourceAcademicYearId}/promotion/runs/${runId}/carry`, {
      method: 'PATCH',
      body: JSON.stringify({ carryOptions }),
    }),

  applyBatchPromotion: (branchId: string, sourceAcademicYearId: string, runId: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${sourceAcademicYearId}/promotion/runs/${runId}/apply`, {
      method: 'POST',
    }),

  publishBatchPromotion: (branchId: string, sourceAcademicYearId: string, runId: string) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${sourceAcademicYearId}/promotion/runs/${runId}/publish`, {
      method: 'POST',
    }),

  carryForwardFee: (data: { fromStudentFeeId: string; toStudentFeeId: string; notes?: string }) =>
    apiRequest('/admin/fees/carry-forward', {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  getFeeCarryForwardSources: (studentId: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/fees/carry-forward/sources/${studentId}${scopeQuery()}`,
    ),

  // ─── API Keys (CEO only) ────────────────────────────
  getApiKeys: () =>
    apiRequest<ApiJsonResult<any[]>>('/api-keys'),

  createApiKey: (data: { name: string; type: string; branchCode?: string }) =>
    apiRequest('/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  revokeApiKey: (id: string) =>
    apiRequest(`/api-keys/${id}`, { method: 'DELETE' }),

  // ─── Sections (branch-scoped, replaces old groups) ──
  getSections: (branchId: string, ayId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/academic-years/${ayId}/sections`),

  createSection: (branchId: string, ayId: string, data: { name: string; section?: string; displayOrder: number; capacity?: number }) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${ayId}/sections`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSection: (branchId: string, id: string, data: { name?: string; section?: string; displayOrder?: number; capacity?: number }) =>
    apiRequest(`/admin/branches/${branchId}/sections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSection: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/sections/${id}`, { method: 'DELETE' }),

  // ─── Old groups (backward compat) ───────────────────
  getGroups: (params?: { section?: string }) => {
    const q = buildScopeParams(params?.section ? { section: params.section } : undefined);
    const qs = q.toString();
    return apiRequest<ApiJsonResult<any[]>>(`/admin/groups${qs ? `?${qs}` : ''}`);
  },

  createGroup: (data: { name: string; section?: string; displayOrder: number; capacity?: number; academicYearId?: string }) =>
    apiRequest('/admin/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: string) =>
    apiRequest(`/admin/groups/${id}`, { method: 'DELETE' }),

  // ─── Students ────────────────────────────────────────────
  getStudents: (params?: { search?: string; groupId?: string; academicYearId?: string; branchId?: string; rollNumber?: string; page?: number; limit?: number; status?: 'active' | 'inactive' | 'all' }) => {
    const q = buildScopeParams({
      search: params?.search,
      groupId: params?.groupId,
      academicYearId: params?.academicYearId,
      branchId: params?.branchId,
      rollNumber: params?.rollNumber,
      page: params?.page ? String(params.page) : undefined,
      limit: params?.limit ? String(params.limit) : undefined,
      // Must be forwarded: the backend filters active vs inactive purely on
      // this flag, and without it every list page gets the full mixed roster.
      status: params?.status,
    });
    const qs = q.toString();
    return apiRequest<{ success: boolean; data: any[]; meta: any }>(`/admin/students${qs ? `?${qs}` : ''}`);
  },

  getStudent: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/students/${id}`),

  createStudent: (data: {
    name: string; gender?: string; dateOfBirth?: string; religion?: string;
    nationality?: string; address?: string; city?: string; postalCode?: string; country?: string;
    phone?: string; bloodGroup?: string; bformCnic?: string; motherTongue?: string;
    studentEmail?: string; studentWhatsapp?: string; previousSchool?: string;
    previousClass?: string; tcNumber?: string; referredBy?: string;
    groupId?: string; admissionNumber?: string; profilePhotoId?: string;
    academicYearId?: string; branchId?: string;
    guardianName?: string; guardianRelation?: string;
  }) => apiRequest('/admin/students', { method: 'POST', body: JSON.stringify(data) }),

  updateStudent: (id: string, data: any) =>
    apiRequest(`/admin/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteStudent: (id: string) =>
    apiRequest(`/admin/students/${id}`, { method: 'DELETE' }),

  deactivateStudent: (id: string) =>
    apiRequest(`/admin/students/${id}/deactivate`, { method: 'POST' }),

  reactivateStudent: (id: string) =>
    apiRequest(`/admin/students/${id}/reactivate`, { method: 'POST' }),

  generateStudentCredentials: (id: string) =>
    apiRequest(`/admin/students/${id}/generate-credentials`, { method: 'PUT' }),

  setStudentPassword: (id: string, password: string, adminPassword: string) =>
    apiRequest(`/admin/students/${id}/set-password`, {
      method: 'PUT', body: JSON.stringify({ password, adminPassword }),
    }),

  // ─── Users (for dropdowns) ──────────────────────────
  getUsers: (params?: { role?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.role) q.set('role', params.role);
    if (params?.search) q.set('search', params.search);
    q.set('limit', '100');
    const qs = q.toString();
    return apiRequest<ApiJsonResult<any[]>>(`/admin/users?${qs}`);
  },

  createUser: (data: { name: string; username: string; password: string; email?: string; phone?: string; role?: string }) =>
    apiRequest('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ─── Subjects ────────────────────────────────────────────
  getSubjects: (branchId: string, ayId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/academic-years/${ayId}/subjects`),

  getSubject: (branchId: string, id: string) =>
    apiRequest<ApiJsonResult>(`/admin/branches/${branchId}/subjects/${id}`),

  createSubject: (branchId: string, ayId: string, data: { name: string; code?: string; description?: string; totalMarks?: number; passingMarks?: number; isElective?: boolean; hodId?: string }) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${ayId}/subjects`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSubject: (branchId: string, id: string, data: { name?: string; code?: string; description?: string; totalMarks?: number; passingMarks?: number; isElective?: boolean; hodId?: string | null }) =>
    apiRequest(`/admin/branches/${branchId}/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSubject: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/subjects/${id}`, { method: 'DELETE' }),

  getSectionSubjects: (branchId: string, sectionId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/sections/${sectionId}/subjects`),

  linkSubjectGroups: (branchId: string, subjectId: string, groupIds: string[]) =>
    apiRequest(`/admin/branches/${branchId}/subjects/${subjectId}/link`, {
      method: 'POST',
      body: JSON.stringify({ groupIds }),
    }),

  unlinkSubjectGroup: (branchId: string, subjectId: string, groupId: string) =>
    apiRequest(`/admin/branches/${branchId}/subjects/${subjectId}/unlink/${groupId}`, { method: 'DELETE' }),

  // ─── Timetables (ID-based) ─────────────────────
  getTimetables: (branchId: string, ayId: string) =>
    apiRequest<{ success: boolean; data: { id: string; name: string; type: string; slotCount: number; activeDays: number }[] }>(`/admin/branches/${branchId}/academic-years/${ayId}/timetables`),

  createTimetable: (branchId: string, ayId: string, data: { name: string; type?: string }) =>
    apiRequest(`/admin/branches/${branchId}/academic-years/${ayId}/timetables`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  renameTimetable: (branchId: string, id: string, newName: string) =>
    apiRequest(`/admin/branches/${branchId}/timetables/${id}/rename`, {
      method: 'PUT', body: JSON.stringify({ newName }),
    }),

  deleteTimetable: (branchId: string, id: string) =>
    apiRequest(`/admin/branches/${branchId}/timetables/${id}`, { method: 'DELETE' }),

  // ─── Timetable Day Config (per timetable ID) ────
  getTimetableDays: (branchId: string, timetableId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/timetables/${timetableId}/days`),

  setTimetableDays: (branchId: string, timetableId: string, days: { dayOfWeek: number; isActive: boolean }[]) =>
    apiRequest(`/admin/branches/${branchId}/timetables/${timetableId}/days`, {
      method: 'PUT', body: JSON.stringify({ days }),
    }),

  // ─── Timetable Slots (per timetable ID) ──────────
  getTimetableSlots: (branchId: string, timetableId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/timetables/${timetableId}/slots`),

  createTimetableSlot: (branchId: string, timetableId: string, data: { dayOfWeek?: number | null; startTime: string; endTime: string }) =>
    apiRequest(`/admin/branches/${branchId}/timetables/${timetableId}/slots`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  deleteTimetableSlot: (branchId: string, timetableId: string, slotId: string) =>
    apiRequest(`/admin/branches/${branchId}/timetables/${timetableId}/slots/${slotId}`, { method: 'DELETE' }),

  getSectionTimetable: (branchId: string, sectionId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/sections/${sectionId}/timetable`),

  upsertTimetableEntry: (branchId: string, sectionId: string, slotId: string, data: { subjectId?: string | null; teacherId?: string | null; note?: string | null }) =>
    apiRequest(`/admin/branches/${branchId}/sections/${sectionId}/timetable/${slotId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  getTeacherTimetables: (branchId: string, teacherId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branches/${branchId}/teachers/${teacherId}/timetables`),

  // ─── Admin Invitations (CEO only) ──────────────────
  createInvitation: (email: string, branchId: string) =>
    apiRequest('/admin/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, branchId }),
    }),

  getInvitations: () =>
    apiRequest<{ success: boolean; data: { pendingInvitations: any[]; admins: any[] } }>('/admin/invitations'),

  validateInvitation: (token: string) =>
    apiRequest<{ success: boolean; data: { email: string; branchId: string; branchName: string; branchCode: string } }>(`/admin/invitations/${token}`),

  completeInvitation: (token: string, data: {
    name: string; username: string; password: string; phone?: string;
    employeeId?: string; qualification?: string; specialization?: string;
    joiningDate?: string; address?: string; emergencyContact?: string; workRole?: string; bio?: string;
  }) =>
    apiRequest(`/admin/invitations/${token}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAdminDetail: (userId: string) =>
    apiRequest<ApiJsonResult>(`/admin/invitations/admins/${userId}`),

  updateAdminProfile: (userId: string, data: Record<string, unknown>) =>
    apiRequest<ApiJsonResult>(`/admin/invitations/admins/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ─── Teachers ────────────────────────────────────────────
  getTeachers: (params?: { search?: string; qualification?: string; page?: number; limit?: number; status?: 'active' | 'inactive' | 'all' }) => {
    const q = buildScopeParams({
      search: params?.search,
      qualification: params?.qualification,
      page: params?.page ? String(params.page) : undefined,
      limit: params?.limit ? String(params.limit) : undefined,
      status: params?.status,
    });
    const qs = q.toString();
    return apiRequest<{ success: boolean; data: any[]; meta: any }>(`/admin/teachers${qs ? `?${qs}` : ''}`);
  },

  getTeacher: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/teachers/${id}`),

  getTeacherPortalPermissions: (teacherProfileId: string, branchId: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/teachers/${teacherProfileId}/portal-permissions?branchId=${encodeURIComponent(branchId)}`,
    ),

  updateTeacherPortalPermissions: (
    teacherProfileId: string,
    data: { portalAccess?: 'FULL' | 'READ_ONLY' | 'FROZEN'; portalPermissions?: Record<string, unknown> },
  ) =>
    apiRequest(`/admin/teachers/${teacherProfileId}/portal-permissions`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  createTeacher: (data: {
    userId?: string; name?: string; email?: string; username?: string; password?: string; branchId?: string;
    employeeId?: string; qualification?: string; specialization?: string;
    joiningDate?: string; salary?: number; phone?: string; emergencyContact?: string;
    address?: string; dateOfBirth?: string; gender?: string; bloodGroup?: string;
    fatherName?: string; cardId?: string; severeDisease?: string; experience?: string; bio?: string;
  }) =>
    apiRequest('/admin/teachers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTeacher: (id: string, data: {
    employeeId?: string; qualification?: string; specialization?: string;
    joiningDate?: string; salary?: number; phone?: string; emergencyContact?: string;
    address?: string; dateOfBirth?: string; gender?: string; bloodGroup?: string;
    fatherName?: string; cardId?: string; severeDisease?: string; experience?: string; bio?: string;
    profilePhotoId?: string;
    portalAccess?: 'FULL' | 'READ_ONLY' | 'FROZEN';
    canViewParentContact?: boolean;
    hodParentContactScope?: 'ASSIGNED_ONLY' | 'DEPARTMENT_ALL';
  }) =>
    apiRequest(`/admin/teachers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTeacher: (id: string) =>
    apiRequest(`/admin/teachers/${id}`, { method: 'DELETE' }),

  deactivateTeacher: (id: string) =>
    apiRequest(`/admin/teachers/${id}/deactivate`, { method: 'POST' }),

  reactivateTeacher: (id: string) =>
    apiRequest(`/admin/teachers/${id}/reactivate`, { method: 'POST' }),


  getTeacherAssignments: (teacherId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/teachers/${teacherId}/assignments`),

  // ─── Assignments ──────────────────────────────────────────
  getGroupAssignments: (groupId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/groups/${groupId}/assignments`),

  createAssignment: (data: { academicYearId: string; teacherId: string; groupId: string; subjectId: string; isClassTeacher?: boolean; role?: string }) =>
    apiRequest('/admin/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAssignment: (id: string, data: { isClassTeacher?: boolean }) =>
    apiRequest(`/admin/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteAssignment: (id: string) =>
    apiRequest(`/admin/assignments/${id}`, { method: 'DELETE' }),

  endAssignment: (id: string, validTo?: string) =>
    apiRequest(`/admin/assignments/${id}/end`, {
      method: 'POST',
      body: JSON.stringify(validTo ? { validTo } : {}),
    }),

  // ─── Exam Sessions (separate module — read-only from Result & Grade hub) ──
  getExamSessions: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/exam-sessions${scopeQuery()}`),

  getExamSession: (sessionId: string) =>
    apiRequest<ApiJsonResult>(`/admin/exam-sessions/${sessionId}${scopeQuery()}`),

  createExamSession: (data: { name: string; startDate: string; endDate: string }) =>
    apiRequest<ApiJsonResult>(`/admin/exam-sessions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateExamSession: (sessionId: string, data: { name?: string; startDate?: string; endDate?: string }) =>
    apiRequest<ApiJsonResult>(`/admin/exam-sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ─── Result & Grade ─────────────────────────────────────
  getResultSessionSummary: (sessionId: string) =>
    apiRequest<ApiJsonResult>(`/admin/result/sessions/${sessionId}/summary${scopeQuery()}`),

  getResultAnalytics: (params?: { sessionId?: string; examId?: string; classId?: string; subjectId?: string }) => {
    const q: Record<string, string> = {};
    if (params?.sessionId && params.sessionId !== 'all') q.sessionId = params.sessionId;
    if (params?.examId && params.examId !== 'all') q.examId = params.examId;
    if (params?.classId) q.classId = params.classId;
    if (params?.subjectId) q.subjectId = params.subjectId;
    return apiRequest<ApiJsonResult>(`/admin/result/analytics${scopeQuery(q)}`);
  },

  getResultExamTypes: (sessionId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/result/sessions/${sessionId}/types${scopeQuery()}`),

  createResultExamType: (sessionId: string, data: { name: string; defaultWeight?: number }) =>
    apiRequest(`/admin/result/sessions/${sessionId}/types`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateResultExamType: (sessionId: string, typeId: string, data: { name?: string; defaultWeight?: number | null }) =>
    apiRequest(`/admin/result/sessions/${sessionId}/types/${typeId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteResultExamType: (sessionId: string, typeId: string) =>
    apiRequest(`/admin/result/sessions/${sessionId}/types/${typeId}`, { method: 'DELETE' }),

  getResultExams: (sessionId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/result/sessions/${sessionId}/exams${scopeQuery()}`),

  createResultExam: (sessionId: string, data: {
    name: string;
    examTypeId: string;
    weightOverride?: number;
    startDate: string;
    endDate?: string;
  }) =>
    apiRequest(`/admin/result/sessions/${sessionId}/exams`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getResultExam: (examId: string) =>
    apiRequest<ApiJsonResult>(`/admin/result/exams/${examId}${scopeQuery()}`),

  updateResultExam: (examId: string, data: {
    name?: string;
    examTypeId?: string;
    weightOverride?: number | null;
    startDate?: string;
    endDate?: string | null;
    status?: 'DRAFT' | 'ACTIVE';
    teacherMarksEntry?: boolean;
  }) =>
    apiRequest(`/admin/result/exams/${examId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteResultExam: (examId: string) =>
    apiRequest(`/admin/result/exams/${examId}`, { method: 'DELETE' }),

  getResultExamStructure: (examId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/result/exams/${examId}/structure${scopeQuery()}`),

  generateResultExamStructure: (
    examId: string,
    options?: { selections?: { classId: string; subjectIds: string[] }[] },
  ) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/result/exams/${examId}/structure`, {
      method: 'POST',
      body: JSON.stringify(options?.selections ? { selections: options.selections } : {}),
    }),

  updateResultStructureClass: (linkId: string, data: { isActive: boolean }) =>
    apiRequest(`/admin/result/structure/classes/${linkId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateResultStructureSubject: (linkId: string, data: { isActive: boolean }) =>
    apiRequest(`/admin/result/structure/subjects/${linkId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getResultMarksGrid: (subjectLinkId: string) =>
    apiRequest<ApiJsonResult>(`/admin/result/structure/subjects/${subjectLinkId}/marks-grid${scopeQuery()}`),

  saveResultMarks: (subjectLinkId: string, data: {
    totalMarks?: number;
    passingMarks?: number;
    entries: { studentId: string; marksObtained?: number | null; isAbsent?: boolean }[];
  }) =>
    apiRequest<ApiJsonResult>(`/admin/result/structure/subjects/${subjectLinkId}/marks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteResultMarksEntry: (entryId: string) =>
    apiRequest(`/admin/result/marks/${entryId}`, { method: 'DELETE' }),

  computeResultSession: (sessionId: string) =>
    apiRequest<{ success: boolean; data: { classSubjectCount: number; studentCount: number } }>(
      `/admin/result/sessions/${sessionId}/compute-results`,
      { method: 'POST' },
    ),

  getClassResults: (sessionId: string, classId: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/result/sessions/${sessionId}/classes/${classId}/results${scopeQuery()}`,
    ),

  computeReportCardsSession: (sessionId: string) =>
    apiRequest<{ success: boolean; data: { classCount: number; reportCardCount: number } }>(
      `/admin/result/sessions/${sessionId}/compute-report-cards`,
      { method: 'POST' },
    ),

  computeReportCardsClass: (sessionId: string, classId: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/result/sessions/${sessionId}/classes/${classId}/compute-report-cards`,
      { method: 'POST' },
    ),

  getClassReportCards: (sessionId: string, classId: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/result/sessions/${sessionId}/classes/${classId}/report-cards${scopeQuery()}`,
    ),

  publishReportCard: (reportCardId: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/result/report-cards/${reportCardId}/publish`,
      { method: 'POST' },
    ),

  getStudentReportCard: (studentId: string, sessionId: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/result/students/${studentId}/sessions/${sessionId}/report-card${scopeQuery()}`,
    ),

  // ─── Canteen (branch-scoped only — use canteenQuery, not scopeQuery) ───
  getCanteenProducts: (activeOnly = true) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/canteen/products${canteenQuery({ activeOnly: activeOnly ? 'true' : 'false' })}`,
    ),

  getCanteenCategories: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/canteen/categories${canteenQuery()}`),

  createCanteenCategory: (name: string) =>
    apiRequest(`/admin/canteen/categories${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  patchCanteenCategory: (id: string, data: { name?: string; isActive?: boolean }) =>
    apiRequest(`/admin/canteen/categories/${id}${canteenQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getCanteenSuppliers: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/canteen/suppliers${canteenQuery()}`),

  getCanteenSupplierDetail: (id: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/canteen/suppliers/${id}${canteenQuery({ detail: 'true' })}`,
    ),

  createCanteenSupplier: (data: { name: string; contactNumber?: string; note?: string }) =>
    apiRequest(`/admin/canteen/suppliers${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  patchCanteenSupplier: (id: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/canteen/suppliers/${id}${canteenQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getCanteenSupplierPayments: (supplierId: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/canteen/suppliers/${supplierId}/payments${canteenQuery()}`,
    ),

  postCanteenSupplierPayment: (supplierId: string, data: { amount: number; direction: string; note?: string }) =>
    apiRequest(`/admin/canteen/suppliers/${supplierId}/payments${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createCanteenProduct: (data: Record<string, unknown>) =>
    apiRequest(`/admin/canteen/products${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  patchCanteenProduct: (id: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/canteen/products/${id}${canteenQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deactivateCanteenProduct: (id: string) =>
    apiRequest(`/admin/canteen/products/${id}${canteenQuery()}`, { method: 'DELETE' }),

  createCanteenRestock: (data: Record<string, unknown>) =>
    apiRequest(`/admin/canteen/restock-purchases${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCanteenRestockPurchases: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/canteen/restock-purchases${canteenQuery()}`),

  getCanteenAccounts: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/canteen/accounts${canteenQuery()}`),

  getCanteenAccount: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/canteen/accounts/${id}${canteenQuery()}`),

  getCanteenAccountDetail: (id: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/canteen/accounts/${id}${canteenQuery({ detail: 'true' })}`,
    ),

  getCanteenAccountSales: (id: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/canteen/accounts/${id}/sales${canteenQuery()}`,
    ),

  createCanteenAccount: (data: { personType: string; studentId?: string; userId?: string }) =>
    apiRequest(`/admin/canteen/accounts${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  postCanteenAccountPayment: (accountId: string, data: { amountPaid: number; note?: string }) =>
    apiRequest(`/admin/canteen/accounts/${accountId}/payments${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCanteenCreditPersons: (type: string, opts?: { q?: string; groupId?: string }) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/canteen/credit-persons${canteenQuery({
        type,
        ...(opts?.q ? { q: opts.q } : {}),
        ...(opts?.groupId ? { groupId: opts.groupId } : {}),
      })}`,
    ),

  getCanteenCreditClasses: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/canteen/credit-classes${canteenQuery()}`),

  postCanteenSale: (data: Record<string, unknown>) =>
    apiRequest(`/admin/canteen/sales${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCanteenSales: (date?: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/canteen/sales${canteenQuery(date ? { date } : undefined)}`,
    ),

  getCanteenSummary: (date?: string) =>
    apiRequest<ApiJsonResult>(
      `/admin/canteen/summary${canteenQuery({ date: date || new Date().toISOString().slice(0, 10) })}`,
    ),

  // ─── Stationary (branch-scoped master + fee-linked assignment) ───
  getStationaryCategories: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/stationary/categories${canteenQuery()}`),
  createStationaryCategory: (name: string) =>
    apiRequest(`/admin/stationary/categories${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  patchStationaryCategory: (id: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/categories/${id}${canteenQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getStationarySuppliers: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/stationary/suppliers${canteenQuery()}`),
  getStationarySupplierDetail: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/stationary/suppliers/${id}${canteenQuery({ detail: 'true' })}`),
  createStationarySupplier: (data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/suppliers${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  patchStationarySupplier: (id: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/suppliers/${id}${canteenQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getStationarySupplierPayments: (supplierId: string) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/stationary/suppliers/${supplierId}/payments${canteenQuery()}`,
    ),
  postStationarySupplierPayment: (supplierId: string, data: { amount: number; direction: string; note?: string }) =>
    apiRequest(`/admin/stationary/suppliers/${supplierId}/payments${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createStationaryRestock: (data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/restock-purchases${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStationaryProducts: (activeOnly = true) =>
    apiRequest<ApiJsonResult<any[]>>(
      `/admin/stationary/products${canteenQuery({ activeOnly: activeOnly ? 'true' : 'false' })}`,
    ),
  createStationaryProduct: (data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/products${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  patchStationaryProduct: (id: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/products/${id}${canteenQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getStationaryInventory: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/stationary/inventory${canteenQuery()}`),
  adjustStationaryInventory: (data: Record<string, unknown>) =>
    apiRequest(`/admin/stationary/inventory/adjust${canteenQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStationarySalesRecords: (search?: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/stationary/sales-records${canteenQuery(search ? { search } : undefined)}`),
  getFeeStationaryCatalog: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/fees/stationary/catalog${scopeQuery()}`),
  assignStationaryToStudentFee: (data: Record<string, unknown>) =>
    apiRequest(`/admin/fees/stationary/assign${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  mePermissions: (branchId?: string) =>
    apiRequest<{ success: boolean; data: import('@/lib/staff-permissions').StaffAccess }>(
      `/me/permissions${scopeQuery(branchId ? { branchId } : undefined)}`,
    ),

  meAcademicYear: () =>
    apiRequest<{ success: boolean; data: { id: string; status: string; branchId: string; calendar?: { label: string } } }>(
      '/me/academic-year',
    ),

  teacherBootstrap: () =>
    apiRequest<ApiJsonResult>(`/teacher/bootstrap${scopeQuery()}`),

  teacherMyAttendance: () =>
    apiRequest<ApiJsonResult<any[]>>(`/teacher/my-attendance${scopeQuery()}`),

  teacherMyPayroll: () =>
    apiRequest<ApiJsonResult<any[]>>(`/teacher/my-payroll${scopeQuery()}`),

  teacherTimetable: () =>
    apiRequest<ApiJsonResult<{ timetableName: string; slots: any[] }>>(
      `/teacher/timetable${scopeQuery()}`,
    ),

  teacherClassStudents: (groupId: string) =>
    apiRequest<ApiJsonResult>(
      `/teacher/classes/${groupId}/students${scopeQuery()}`,
    ),

  teacherClassCommunity: (groupId: string) =>
    apiRequest<ApiJsonResult<{ id: string; groupId: string; academicYearId: string; groupLabel: string }>>(
      `/teacher/classes/${groupId}/community${scopeQuery()}`,
    ),

  getTeacherClassRoles: (communityId: string) =>
    apiRequest<ApiJsonResult>(`/teacher/communities/${communityId}/roles${scopeQuery()}`),

  createTeacherClassRole: (
    communityId: string,
    data: {
      name: string;
      description?: string | null;
      canPostInGroups?: boolean;
      canReceiveDms?: boolean;
      canInitiateDms?: boolean;
    },
  ) =>
    apiRequest(`/teacher/communities/${communityId}/roles${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  updateTeacherClassRole: (
    communityId: string,
    roleId: string,
    data: {
      name?: string;
      description?: string | null;
      canPostInGroups?: boolean;
      canReceiveDms?: boolean;
      canInitiateDms?: boolean;
    },
  ) =>
    apiRequest(`/teacher/communities/${communityId}/roles/${roleId}${scopeQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(scopeBody(data)),
    }),

  deleteTeacherClassRole: (communityId: string, roleId: string) =>
    apiRequest(`/teacher/communities/${communityId}/roles/${roleId}${scopeQuery()}`, {
      method: 'DELETE',
    }),

  assignTeacherClassRole: (
    communityId: string,
    roleId: string,
    data: { studentId: string; publicDisplayName?: string; isMessagingRestricted?: boolean },
  ) =>
    apiRequest(`/teacher/communities/${communityId}/roles/${roleId}/assign${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  removeTeacherClassAssignment: (communityId: string, assignmentId: string) =>
    apiRequest(`/teacher/communities/${communityId}/assignments/${assignmentId}${scopeQuery()}`, {
      method: 'DELETE',
    }),

  adminClassCommunityByGroup: (groupId: string) =>
    apiRequest<ApiJsonResult<{ id: string; groupId: string; academicYearId: string; groupLabel: string }>>(
      `/admin/communities/by-group/${groupId}${scopeQuery()}`,
    ),

  getAdminClassRoles: (communityId: string) =>
    apiRequest<ApiJsonResult>(`/admin/communities/${communityId}/roles${scopeQuery()}`),

  createAdminClassRole: (
    communityId: string,
    data: {
      name: string;
      description?: string | null;
      canPostInGroups?: boolean;
      canReceiveDms?: boolean;
      canInitiateDms?: boolean;
    },
  ) =>
    apiRequest(`/admin/communities/${communityId}/roles${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  updateAdminClassRole: (
    communityId: string,
    roleId: string,
    data: {
      name?: string;
      description?: string | null;
      canPostInGroups?: boolean;
      canReceiveDms?: boolean;
      canInitiateDms?: boolean;
    },
  ) =>
    apiRequest(`/admin/communities/${communityId}/roles/${roleId}${scopeQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(scopeBody(data)),
    }),

  deleteAdminClassRole: (communityId: string, roleId: string) =>
    apiRequest(`/admin/communities/${communityId}/roles/${roleId}${scopeQuery()}`, {
      method: 'DELETE',
    }),

  assignAdminClassRole: (
    communityId: string,
    roleId: string,
    data: { studentId: string; publicDisplayName?: string; isMessagingRestricted?: boolean },
  ) =>
    apiRequest(`/admin/communities/${communityId}/roles/${roleId}/assign${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  removeAdminClassAssignment: (communityId: string, assignmentId: string) =>
    apiRequest(`/admin/communities/${communityId}/assignments/${assignmentId}${scopeQuery()}`, {
      method: 'DELETE',
    }),

  teacherAttendance: (groupId: string, date: string) =>
    apiRequest<ApiJsonResult>(
      `/teacher/attendance${scopeQuery({ groupId, date })}`,
    ),

  teacherSaveAttendance: (body: {
    groupId: string;
    date: string;
    records: Array<{ studentId: string; status: string; note?: string | null }>;
  }) =>
    apiRequest(`/teacher/attendance/batch${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(body)),
    }),

  teacherProfile: () =>
    apiRequest<ApiJsonResult>(`/teacher/profile${scopeQuery()}`),

  teacherUpdateProfile: (body: {
    phone?: string | null;
    emergencyContact?: string | null;
    address?: string | null;
  }) =>
    apiRequest<ApiJsonResult>(`/teacher/profile${scopeQuery()}`, {
      method: 'PUT',
      body: JSON.stringify(scopeBody(body)),
    }),

  teacherAnnouncements: () =>
    apiRequest<ApiJsonResult<any[]>>(`/teacher/announcements${scopeQuery()}`),

  teacherMarksSubjects: () =>
    apiRequest<ApiJsonResult<any[]>>(`/teacher/marks/subjects${scopeQuery()}`),

  teacherMarksTable: (filters?: {
    sessionId?: string;
    examTypeId?: string;
    subjectId?: string;
    studentId?: string;
  }) =>
    apiRequest<ApiJsonResult>(
      `/teacher/marks/table${scopeQuery({
        sessionId: filters?.sessionId,
        examTypeId: filters?.examTypeId,
        subjectId: filters?.subjectId,
        studentId: filters?.studentId,
      })}`,
    ),

  teacherMarksGrid: (examClassSubjectId: string) =>
    apiRequest<ApiJsonResult>(
      `/teacher/marks/grid/${examClassSubjectId}${scopeQuery()}`,
    ),

  teacherSaveMarks: (
    examClassSubjectId: string,
    body: {
      totalMarks?: number;
      passingMarks?: number;
      entries: Array<{ studentId: string; marksObtained?: number | null; isAbsent?: boolean }>;
    },
  ) =>
    apiRequest(`/teacher/marks/grid/${examClassSubjectId}${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(body)),
    }),

  teacherHodDepartment: () =>
    apiRequest<ApiJsonResult>(`/teacher/hod/department${scopeQuery()}`),

  teacherHodMarksSubjects: () =>
    apiRequest<ApiJsonResult<any[]>>(`/teacher/hod/marks/subjects${scopeQuery()}`),

  teacherNotifications: (opts?: { unreadOnly?: boolean; limit?: number }) =>
    apiRequest<{ success: boolean; data: { items: any[]; unreadCount: number } }>(
      `/teacher/notifications${scopeQuery({
        unreadOnly: opts?.unreadOnly ? 'true' : undefined,
        limit: opts?.limit ? String(opts.limit) : undefined,
      })}`,
    ),

  teacherMarkNotificationRead: (id: string) =>
    apiRequest(`/teacher/notifications/${id}/read${scopeQuery()}`, { method: 'PATCH' }),

  teacherMarkAllNotificationsRead: () =>
    apiRequest(`/teacher/notifications/read-all${scopeQuery()}`, { method: 'POST' }),

  studentBootstrap: () =>
    apiRequest<ApiJsonResult<import('@/lib/student/types').StudentBootstrapData>>(
      `/student/bootstrap${scopeQuery()}`,
    ),

  studentProfile: () =>
    apiRequest<ApiJsonResult>(`/student/profile${scopeQuery()}`),

  studentFees: () =>
    apiRequest<ApiJsonResult<{ summary: Record<string, number>; months: unknown[] }>>(
      `/student/fees${scopeQuery()}`,
    ),

  studentAttendance: (params?: { from?: string; to?: string }) =>
    apiRequest<ApiJsonResult<{ records: unknown[]; summary: Record<string, number> }>>(
      `/student/attendance${scopeQuery({ from: params?.from, to: params?.to })}`,
    ),

  studentResultsTable: (params?: { sessionId?: string; examTypeId?: string; subjectId?: string }) =>
    apiRequest<ApiJsonResult<{ rows: unknown[]; filters: Record<string, unknown[]> }>>(
      `/student/results/table${scopeQuery({
        sessionId: params?.sessionId,
        examTypeId: params?.examTypeId,
        subjectId: params?.subjectId,
      })}`,
    ),

  studentCanteen: () =>
    apiRequest<ApiJsonResult>(`/student/canteen${scopeQuery()}`),

  studentTimetable: () =>
    apiRequest<ApiJsonResult<{ timetableName: string; groupLabel?: string; slots: unknown[] }>>(
      `/student/timetable${scopeQuery()}`,
    ),

  studentDatesheets: () =>
    apiRequest<ApiJsonResult<any[]>>(`/student/datesheets${scopeQuery()}`),

  studentAnnouncements: () =>
    apiRequest<ApiJsonResult<any[]>>(`/student/announcements${scopeQuery()}`),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    apiRequest('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    }),

  getStaffList: (params?: { search?: string; status?: string }) =>
    apiRequest<{ success: boolean; data: any[]; meta: { total: number } }>(
      `/admin/staff${scopeQuery({
        search: params?.search,
        status: params?.status,
      })}`,
    ),

  getStaffMember: (userId: string) =>
    apiRequest<ApiJsonResult>(`/admin/staff/${userId}${scopeQuery()}`),

  createStaffMember: (data: Record<string, unknown>) =>
    apiRequest(`/admin/staff${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStaffMember: (userId: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/staff/${userId}${scopeQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateStaffPermissions: (userId: string, permissions: unknown[]) =>
    apiRequest(`/admin/staff/${userId}/permissions${scopeQuery()}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),

  deactivateStaffMember: (userId: string) =>
    apiRequest(`/admin/staff/${userId}/deactivate${scopeQuery()}`, { method: 'POST' }),

  reactivateStaffMember: (userId: string) =>
    apiRequest(`/admin/staff/${userId}/reactivate${scopeQuery()}`, { method: 'POST' }),


  getBranchMemberTenures: (branchMemberId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/branch-members/${branchMemberId}/tenures${scopeQuery()}`),
  addBranchMemberTenureJoin: (branchMemberId: string, data?: { joinedAt?: string; previousTenureId?: string }) =>
    apiRequest(`/admin/branch-members/${branchMemberId}/tenures/join${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data || {})),
    }),
  addBranchMemberTenureLeave: (branchMemberId: string, data: { leftAt?: string; endReason: string; notes?: string }) =>
    apiRequest(`/admin/branch-members/${branchMemberId}/tenures/leave${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  getTeacherTenures: (userId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/teachers/${userId}/tenures${scopeQuery()}`),
  addTeacherTenureJoin: (userId: string, data?: { joinedAt?: string; previousTenureId?: string }) =>
    apiRequest(`/admin/teachers/${userId}/tenures/join${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data || {})),
    }),
  addTeacherTenureLeave: (userId: string, data: { leftAt?: string; endReason: string; notes?: string }) =>
    apiRequest(`/admin/teachers/${userId}/tenures/leave${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),

  getStudentSchoolTenures: (studentId: string) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/students/${studentId}/school-tenures${scopeQuery()}`),
  addStudentSchoolTenureJoin: (studentId: string, data?: { joinedAt?: string }) =>
    apiRequest(`/admin/students/${studentId}/school-tenures/join${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data || {})),
    }),
  addStudentSchoolTenureLeave: (studentId: string, data: { leftAt?: string; endReason: string; notes?: string }) =>
    apiRequest(`/admin/students/${studentId}/school-tenures/leave${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(scopeBody(data)),
    }),
  addStudentClassMovement: (studentId: string, data: { toGroupId: string; effectiveAt?: string; reason?: string }) =>
    apiRequest(`/admin/students/${studentId}/class-movements${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createWorker: (data: Record<string, unknown>) =>
    apiRequest(`/admin/staff/workers${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getExpensesSummary: (month?: string) =>
    apiRequest<ApiJsonResult>(`/admin/expenses/summary${scopeQuery(month ? { month } : {})}`),

  getPayrollList: (month?: string) =>
    apiRequest<{ success: boolean; data: any[]; month: string }>(`/admin/expenses/payroll${scopeQuery(month ? { month } : {})}`),

  getPayrollBulkPreview: (params?: Record<string, string>) =>
    apiRequest<{ success: boolean; data: any[]; month: string }>(`/admin/expenses/payroll/preview${scopeQuery(params)}`),

  recordPayrollBulk: (data: Record<string, unknown>) =>
    apiRequest(`/admin/expenses/payroll/bulk${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPayrollPayeeProfile: (userId: string, limit?: number) =>
    apiRequest<ApiJsonResult>(`/admin/expenses/payroll/profile/${userId}${scopeQuery(limit ? { limit: String(limit) } : {})}`),

  getPayrollPayeeDetail: (userId: string, month?: string) =>
    apiRequest<ApiJsonResult>(`/admin/expenses/payroll/payee/${userId}${scopeQuery(month ? { month } : {})}`),

  recordPayrollPayment: (data: Record<string, unknown>) =>
    apiRequest(`/admin/expenses/payroll${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getUtilityCategories: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/utilities/categories${scopeQuery()}`),

  createUtilityCategory: (name: string) =>
    apiRequest(`/admin/expenses/utilities/categories${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getUtilityProviders: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/utilities/providers${scopeQuery()}`),

  getUtilityBills: (params?: Record<string, string>) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/utilities${scopeQuery(params)}`),

  recordUtilityBill: (data: Record<string, unknown>) =>
    apiRequest(`/admin/expenses/utilities${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOtherCategories: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/others/categories${scopeQuery()}`),

  createOtherCategory: (name: string) =>
    apiRequest(`/admin/expenses/others/categories${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getOtherPayments: (params?: Record<string, string>) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/others${scopeQuery(params)}`),

  recordOtherPayment: (data: Record<string, unknown>) =>
    apiRequest(`/admin/expenses/others${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  voidExpenseVoucher: (id: string, reason: string) =>
    apiRequest(`/admin/expenses/vouchers/${id}/void${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getExpenseVoucher: (id: string) =>
    apiRequest<ApiJsonResult>(`/admin/expenses/vouchers/${id}${scopeQuery()}`),

  getExpenseVouchers: (params?: Record<string, string>) =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/vouchers${scopeQuery(params)}`),

  exportPayrollCsv: (month?: string) =>
    apiRequest<{ success: boolean; data: { filename: string; csv: string } }>(
      `/admin/expenses/export/payroll${scopeQuery(month ? { month } : {})}`,
    ),

  exportUtilitiesCsv: (params?: Record<string, string>) =>
    apiRequest<{ success: boolean; data: { filename: string; csv: string } }>(
      `/admin/expenses/export/utilities${scopeQuery(params)}`,
    ),

  exportOthersCsv: (params?: Record<string, string>) =>
    apiRequest<{ success: boolean; data: { filename: string; csv: string } }>(
      `/admin/expenses/export/others${scopeQuery(params)}`,
    ),

  duplicateUtilityBill: (providerId: string, data?: Record<string, unknown>) =>
    apiRequest(`/admin/expenses/utilities/duplicate-last${scopeQuery()}`, {
      method: 'POST',
      body: JSON.stringify({ providerId, ...data }),
    }),

  getUtilityReminders: () =>
    apiRequest<ApiJsonResult<any[]>>(`/admin/expenses/utilities/reminders${scopeQuery()}`),

  updateUtilityProvider: (id: string, data: Record<string, unknown>) =>
    apiRequest(`/admin/expenses/utilities/providers/${id}${scopeQuery()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
