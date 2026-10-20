'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, UserPlus, Search, X, Edit3, Trash2, ExternalLink, Shield, HardHat, UserX,
} from 'lucide-react';
import { api } from '@/lib/api';
import config from '@/config';
import { showToast } from '@/components/toast';
import ConfirmModal from '@/components/confirm-modal';
import AvatarImage from '@/components/avatar-image';
import {
  PermissionMatrix,
  emptyPermMap,
  formatModuleSummary,
  toPermArray,
  type ModulePermission,
} from '@/components/staff-permission-matrix';

type StaffRow = {
  userId: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  branchRole: string;
  permissions: ModulePermission[];
  profilePhotoId?: string | null;
  employeeId?: string | null;
  workRole?: string | null;
  qualification?: string | null;
};

const emptyCreateForm = () => ({
  name: '', username: '', email: '', phone: '',
  employeeId: '', workRole: '', qualification: '', specialization: '',
  joiningDate: '', salary: '', emergencyContact: '', address: '',
  dateOfBirth: '', gender: '', bloodGroup: '', fatherName: '',
  cardId: '', severeDisease: '', experience: '', bio: '',
});

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-warm-muted">{label}{required && ' *'}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', step }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; step?: string;
}) {
  return (
    <input
      type={type}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors"
    />
  );
}

const selectClass =
  'w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none focus:border-warm-accent transition-colors';

const emptyWorkerForm = () => ({
  name: '', phone: '', employeeId: '', workRole: '', fatherName: '', qualification: '', specialization: '',
  joiningDate: '', salary: '', emergencyContact: '', address: '',
  dateOfBirth: '', gender: '', bloodGroup: '', cardId: '', severeDisease: '', experience: '', bio: '',
});

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inactiveCount, setInactiveCount] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [showWorker, setShowWorker] = useState(false);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [workerError, setWorkerError] = useState('');
  const [wf, setWf] = useState(emptyWorkerForm);
  const [workerPhotoId, setWorkerPhotoId] = useState<string | null>(null);
  const [workerPhotoPreview, setWorkerPhotoPreview] = useState<string | null>(null);
  const workerPhotoRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [cf, setCf] = useState(emptyCreateForm);
  const [createPhotoId, setCreatePhotoId] = useState<string | null>(null);
  const [createPhotoPreview, setCreatePhotoPreview] = useState<string | null>(null);
  const createPhotoRef = useRef<HTMLInputElement>(null);
  const [createPerms, setCreatePerms] = useState(emptyPermMap);

  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string;
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', action: async () => {} });

  const load = useCallback(() => {
    setLoading(true);
    api.getStaffList({
      search: search.trim() || undefined,
      // 'all' is sent explicitly — an omitted status means "active only" server-side.
      status: statusFilter,
    })
      .then((r) => {
        let list = r.data || [];
        if (roleFilter === 'worker') list = list.filter((s: StaffRow) => s.branchRole === 'worker');
        else if (roleFilter === 'staff') list = list.filter((s: StaffRow) => s.branchRole !== 'worker');
        setStaff(list);
      })
      .catch((e) => showToast('error', e.message))
      .finally(() => setLoading(false));

    api.getStaffList({ status: 'inactive' })
      .then((d) => setInactiveCount(d.meta?.total ?? 0))
      .catch(() => {});
  }, [search, statusFilter, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const resetCreate = () => {
    setCf(emptyCreateForm());
    setCreatePhotoId(null);
    setCreatePhotoPreview(null);
    setCreatePerms(emptyPermMap());
    setCreateError('');
  };

  const uploadCreatePhoto = async (file: File) => {
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'profile');
      const res = await fetch(`${config.apiUrl}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Upload failed');
      setCreatePhotoId(result.data.id);
      setCreatePhotoPreview(URL.createObjectURL(file));
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Failed to upload photo');
    }
  };

  const handleCreate = async () => {
    setCreateError('');
    if (!cf.name.trim() || !cf.username.trim()) {
      setCreateError('Name and username are required');
      return;
    }
    const permissions = toPermArray(createPerms);
    if (permissions.length === 0) {
      setCreateError('Select at least one module');
      return;
    }
    setCreating(true);
    try {
      await api.createStaffMember({
        name: cf.name.trim(),
        username: cf.username.trim(),
        email: cf.email.trim() || undefined,
        phone: cf.phone.trim() || undefined,
        employeeId: cf.employeeId.trim() || undefined,
        workRole: cf.workRole.trim() || undefined,
        fatherName: cf.fatherName.trim() || undefined,
        qualification: cf.qualification.trim() || undefined,
        specialization: cf.specialization.trim() || undefined,
        joiningDate: cf.joiningDate || undefined,
        dateOfBirth: cf.dateOfBirth || undefined,
        address: cf.address.trim() || undefined,
        salary: cf.salary.trim() ? Number(cf.salary) : undefined,
        gender: cf.gender || undefined,
        bloodGroup: cf.bloodGroup.trim() || undefined,
        emergencyContact: cf.emergencyContact.trim() || undefined,
        cardId: cf.cardId.trim() || undefined,
        severeDisease: cf.severeDisease.trim() || undefined,
        experience: cf.experience.trim() || undefined,
        bio: cf.bio.trim() || undefined,
        profilePhotoId: createPhotoId || undefined,
        permissions,
      });
      setShowCreate(false);
      resetCreate();
      showToast('success', 'Staff member created');
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create staff';
      setCreateError(msg);
      showToast('error', msg);
    } finally {
      setCreating(false);
    }
  };

  const resetWorker = () => {
    setWf(emptyWorkerForm());
    setWorkerPhotoId(null);
    setWorkerPhotoPreview(null);
    setWorkerError('');
  };

  const uploadWorkerPhoto = async (file: File) => {
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'profile');
      const res = await fetch(`${config.apiUrl}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Upload failed');
      setWorkerPhotoId(result.data.id);
      setWorkerPhotoPreview(URL.createObjectURL(file));
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Failed to upload photo');
    }
  };

  const handleCreateWorker = async () => {
    setWorkerError('');
    if (!wf.name.trim()) {
      setWorkerError('Name is required');
      return;
    }
    setCreatingWorker(true);
    try {
      await api.createWorker({
        name: wf.name.trim(),
        phone: wf.phone.trim() || undefined,
        employeeId: wf.employeeId.trim() || undefined,
        workRole: wf.workRole.trim() || undefined,
        fatherName: wf.fatherName.trim() || undefined,
        qualification: wf.qualification.trim() || undefined,
        specialization: wf.specialization.trim() || undefined,
        joiningDate: wf.joiningDate || undefined,
        dateOfBirth: wf.dateOfBirth || undefined,
        address: wf.address.trim() || undefined,
        salary: wf.salary.trim() ? Number(wf.salary) : undefined,
        gender: wf.gender || undefined,
        bloodGroup: wf.bloodGroup.trim() || undefined,
        emergencyContact: wf.emergencyContact.trim() || undefined,
        cardId: wf.cardId.trim() || undefined,
        severeDisease: wf.severeDisease.trim() || undefined,
        experience: wf.experience.trim() || undefined,
        bio: wf.bio.trim() || undefined,
        profilePhotoId: workerPhotoId || undefined,
      });
      setShowWorker(false);
      resetWorker();
      showToast('success', 'Worker added (payroll only, no module login)');
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create worker';
      setWorkerError(msg);
      showToast('error', msg);
    } finally {
      setCreatingWorker(false);
    }
  };

  const promptDeactivate = (s: StaffRow) => {
    setConfirm({
      open: true,
      title: `Deactivate "${s.name}"?`,
      message: 'Login will be disabled. Module permissions are preserved and can be restored later.',
      variant: 'warning',
      confirmLabel: 'Deactivate',
      action: async () => {
        await api.deactivateStaffMember(s.userId);
        showToast('success', `"${s.name}" deactivated`);
        load();
      },
    });
  };

  const promptReactivate = (s: StaffRow) => {
    setConfirm({
      open: true,
      title: `Reactivate "${s.name}"?`,
      message: 'Login and branch access will be restored with existing module permissions.',
      variant: 'default',
      confirmLabel: 'Reactivate',
      action: async () => {
        await api.reactivateStaffMember(s.userId);
        showToast('success', `"${s.name}" reactivated`);
        load();
      },
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-light text-warm-cream">Staff</h1>
          <p className="text-sm text-warm-muted">Manage staff accounts and module access.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push('/admin/staff/deactivated')}
            className="flex items-center gap-1.5 rounded-lg border border-warm-card-border px-4 py-2 text-sm text-warm-muted transition-colors hover:text-warm-cream"
            title="View deactivated staff"
          >
            <UserX size={15} /> Deactivated
            {inactiveCount > 0 && (
              <span className="rounded-full bg-warm-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-warm-accent">
                {inactiveCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { resetWorker(); setShowWorker(true); }}
            className="flex items-center gap-1.5 rounded-lg border border-warm-card-border px-4 py-2 text-sm text-warm-muted transition-colors hover:text-warm-cream"
          >
            <HardHat size={15} /> Add Worker
          </button>
          <button
            type="button"
            onClick={() => { resetCreate(); setShowCreate(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-warm-accent px-4 py-2 text-sm font-medium text-[#1a1614] transition-colors hover:bg-[#b39a76]"
          >
            <Plus size={15} /> Add Staff
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search by name, username, or employee ID…"
            className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] py-2 pl-9 pr-3 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-muted outline-none focus:border-warm-accent transition-colors"
        >
          <option value="all">All roles</option>
          <option value="staff">Staff (with access)</option>
          <option value="worker">Workers only</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-muted outline-none focus:border-warm-accent transition-colors"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-warm-card-border px-4 py-2 text-xs text-warm-muted transition-colors hover:text-warm-cream"
        >
          Search
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-warm-card" />
          ))}
        </div>
      )}

      {!loading && staff.length === 0 && (
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-8 text-center">
          <UserPlus size={32} className="mx-auto mb-3 text-warm-muted" />
          <p className="text-sm text-warm-muted">No staff found.</p>
          <button
            type="button"
            onClick={() => { resetCreate(); setShowCreate(true); }}
            className="mt-4 text-xs text-warm-accent hover:underline"
          >
            Add your first staff member
          </button>
        </div>
      )}

      {!loading && staff.length > 0 && (
        <div className="space-y-3">
          {staff.map((s) => (
            <div
              key={s.userId}
              className="flex items-center justify-between rounded-xl border border-warm-card-border bg-warm-card p-4 transition-colors hover:bg-warm-card/80"
            >
              <button
                type="button"
                onClick={() => router.push(`/admin/staff/${s.userId}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="relative shrink-0">
                  {s.profilePhotoId ? (
                    <AvatarImage
                      fileId={s.profilePhotoId}
                      className="h-10 w-10 rounded-lg border border-warm-card-border object-cover"
                      fallback={s.name?.charAt(0)}
                    />
                  ) : s.branchRole === 'worker' ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <HardHat size={18} className="text-amber-400" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                      <Shield size={18} className="text-violet-400" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-warm-cream">
                    {s.name}
                    {s.branchRole === 'worker' && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-normal text-amber-400">Worker</span>
                    )}
                    {s.employeeId && (
                      <span className="text-[10px] font-normal text-warm-muted/60">({s.employeeId})</span>
                    )}
                    {s.username && (
                      <span className="text-[10px] font-normal text-warm-muted/60">@{s.username}</span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-warm-muted">
                    {s.workRole && <span>{s.workRole}</span>}
                    {s.qualification && <span>{s.qualification}</span>}
                    <span className="truncate">{formatModuleSummary(s.permissions)}</span>
                    <span className={`inline-flex items-center gap-1 ${
                      s.status === 'active' ? 'text-green-400' : 'text-warm-muted/50'
                    }`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.status === 'active' ? 'bg-green-400' : 'bg-gray-500'}`} />
                      {s.status}
                    </span>
                  </p>
                </div>
              </button>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/staff/${s.userId}`)}
                  className="rounded-lg p-1.5 text-warm-muted transition-colors hover:bg-warm-card-border/30 hover:text-warm-cream"
                  title="Edit access"
                >
                  <Edit3 size={14} />
                </button>
                {s.status === 'active' ? (
                  <button
                    type="button"
                    onClick={() => promptDeactivate(s)}
                    className="rounded-lg p-1.5 text-warm-muted transition-colors hover:bg-warm-card-border/30 hover:text-red/80"
                    title="Deactivate"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => promptReactivate(s)}
                    className="rounded-lg p-1.5 text-warm-muted transition-colors hover:bg-warm-card-border/30 hover:text-green-400"
                    title="Reactivate"
                  >
                    <span className="text-[13px]">↻</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/admin/staff/${s.userId}`)}
                  className="rounded-lg p-1.5 text-warm-muted transition-colors hover:bg-warm-card-border/30 hover:text-warm-cream"
                  title="View details"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => { setShowCreate(false); resetCreate(); }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-warm-card-border bg-[#24201e] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-warm-cream">Add Staff Member</h2>
              <button
                type="button"
                onClick={() => { setShowCreate(false); resetCreate(); }}
                className="text-warm-muted transition-colors hover:text-warm-cream"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => createPhotoRef.current?.click()}
                  className="group relative shrink-0"
                >
                  {createPhotoPreview ? (
                    <img
                      src={createPhotoPreview}
                      alt="Preview"
                      className="h-20 w-16 rounded-lg border-2 border-warm-card-border object-cover"
                    />
                  ) : createPhotoId ? (
                    <AvatarImage
                      fileId={createPhotoId}
                      className="h-20 w-16 rounded-lg border-2 border-warm-card-border"
                    />
                  ) : (
                    <div className="flex h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-warm-card-border bg-[#1a1614] text-[10px] text-warm-muted group-hover:border-warm-accent">
                      Photo
                    </div>
                  )}
                </button>
                <input
                  ref={createPhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadCreatePhoto(file);
                    e.target.value = '';
                  }}
                />
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <Field label="Full Name" required>
                    <Input value={cf.name} onChange={(v) => setCf((p) => ({ ...p, name: v }))} placeholder="e.g. Ms. Rubina Shaheen" />
                  </Field>
                  <Field label="Email">
                    <Input value={cf.email} onChange={(v) => setCf((p) => ({ ...p, email: v }))} placeholder="optional" />
                  </Field>
                </div>
              </div>

              <Field label="Username" required>
                <Input value={cf.username} onChange={(v) => setCf((p) => ({ ...p, username: v }))} placeholder="e.g. rubina_fees" />
              </Field>

              <hr className="border-warm-card-border" />
              <p className="text-[10px] font-medium uppercase tracking-wider text-warm-muted">Profile details</p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Employee ID">
                  <Input value={cf.employeeId} onChange={(v) => setCf((p) => ({ ...p, employeeId: v }))} placeholder="e.g. STF-122" />
                </Field>
                <Field label="Work Role">
                  <Input value={cf.workRole} onChange={(v) => setCf((p) => ({ ...p, workRole: v }))} placeholder="e.g. Accountant, Receptionist" />
                </Field>
              </div>
              <Field label="Father Name">
                <Input value={cf.fatherName} onChange={(v) => setCf((p) => ({ ...p, fatherName: v }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Qualification">
                  <Input value={cf.qualification} onChange={(v) => setCf((p) => ({ ...p, qualification: v }))} placeholder="e.g. M.Sc. (Biology)" />
                </Field>
                <Field label="Specialization">
                  <Input value={cf.specialization} onChange={(v) => setCf((p) => ({ ...p, specialization: v }))} placeholder="e.g. Science (Sections)" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Joining Date">
                  <Input type="date" value={cf.joiningDate} onChange={(v) => setCf((p) => ({ ...p, joiningDate: v }))} />
                </Field>
                <Field label="Date of Birth">
                  <Input type="date" value={cf.dateOfBirth} onChange={(v) => setCf((p) => ({ ...p, dateOfBirth: v }))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input value={cf.phone} onChange={(v) => setCf((p) => ({ ...p, phone: v }))} placeholder="+92 300 …" />
                </Field>
                <Field label="Emergency Contact">
                  <Input value={cf.emergencyContact} onChange={(v) => setCf((p) => ({ ...p, emergencyContact: v }))} />
                </Field>
              </div>
              <Field label="Address">
                <Input value={cf.address} onChange={(v) => setCf((p) => ({ ...p, address: v }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Salary">
                  <Input type="number" step="0.01" value={cf.salary} onChange={(v) => setCf((p) => ({ ...p, salary: v }))} />
                </Field>
                <Field label="Blood Group">
                  <Input value={cf.bloodGroup} onChange={(v) => setCf((p) => ({ ...p, bloodGroup: v }))} />
                </Field>
                <Field label="Card ID">
                  <Input value={cf.cardId} onChange={(v) => setCf((p) => ({ ...p, cardId: v }))} />
                </Field>
                <Field label="Severe Disease">
                  <Input value={cf.severeDisease} onChange={(v) => setCf((p) => ({ ...p, severeDisease: v }))} />
                </Field>
                <Field label="Gender">
                  <select value={cf.gender} onChange={(e) => setCf((p) => ({ ...p, gender: e.target.value }))} className={selectClass}>
                    <option value="">— Select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Experience">
                  <Input value={cf.experience} onChange={(v) => setCf((p) => ({ ...p, experience: v }))} placeholder="e.g. 5 years" />
                </Field>
              </div>
              <Field label="Bio">
                <textarea
                  value={cf.bio}
                  onChange={(e) => setCf((p) => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  className={`${selectClass} resize-none placeholder:text-warm-muted/40`}
                  placeholder="Short summary"
                />
              </Field>

              <hr className="border-warm-card-border" />
              <p className="text-[10px] font-medium uppercase tracking-wider text-warm-muted">Module access</p>
              <PermissionMatrix value={createPerms} onChange={setCreatePerms} compact />
            </div>

            {createError && (
              <div className="mt-3 rounded-lg border border-red-900/30 bg-red-900/10 px-3 py-2">
                <p className="text-xs text-red-400">{createError}</p>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowCreate(false); resetCreate(); }}
                className="rounded-lg border border-warm-card-border px-4 py-2 text-xs text-warm-muted transition-colors hover:text-warm-cream"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-warm-accent px-4 py-2 text-xs font-medium text-[#1a1614] transition-colors hover:bg-[#b39a76] disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => { setShowWorker(false); resetWorker(); }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-warm-card-border bg-[#24201e] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-warm-cream">Add Worker</h2>
                <p className="mt-0.5 text-[11px] text-warm-muted">Full profile · payroll & attendance only (no module login)</p>
              </div>
              <button type="button" onClick={() => { setShowWorker(false); resetWorker(); }} className="text-warm-muted hover:text-warm-cream">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => workerPhotoRef.current?.click()} className="group relative shrink-0">
                  {workerPhotoPreview ? (
                    <img
                      src={workerPhotoPreview}
                      alt="Preview"
                      className="h-20 w-16 rounded-lg border-2 border-warm-card-border object-cover"
                    />
                  ) : workerPhotoId ? (
                    <AvatarImage
                      fileId={workerPhotoId}
                      className="h-20 w-16 rounded-lg border-2 border-warm-card-border"
                    />
                  ) : (
                    <div className="flex h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-warm-card-border bg-[#1a1614] text-[10px] text-warm-muted group-hover:border-warm-accent">
                      Photo
                    </div>
                  )}
                </button>
                <input ref={workerPhotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadWorkerPhoto(file);
                  e.target.value = '';
                }} />
                <div className="grid flex-1 grid-cols-1 gap-3">
                  <Field label="Full Name" required>
                    <Input value={wf.name} onChange={(v) => setWf((p) => ({ ...p, name: v }))} placeholder="e.g. Ali Khan" />
                  </Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employee ID"><Input value={wf.employeeId} onChange={(v) => setWf((p) => ({ ...p, employeeId: v }))} /></Field>
                <Field label="Work Role"><Input value={wf.workRole} onChange={(v) => setWf((p) => ({ ...p, workRole: v }))} placeholder="e.g. Guard, Cleaner" /></Field>
              </div>
              <Field label="Father Name"><Input value={wf.fatherName} onChange={(v) => setWf((p) => ({ ...p, fatherName: v }))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Qualification"><Input value={wf.qualification} onChange={(v) => setWf((p) => ({ ...p, qualification: v }))} /></Field>
                <Field label="Specialization"><Input value={wf.specialization} onChange={(v) => setWf((p) => ({ ...p, specialization: v }))} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Joining Date"><Input type="date" value={wf.joiningDate} onChange={(v) => setWf((p) => ({ ...p, joiningDate: v }))} /></Field>
                <Field label="Date of Birth"><Input type="date" value={wf.dateOfBirth} onChange={(v) => setWf((p) => ({ ...p, dateOfBirth: v }))} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone"><Input value={wf.phone} onChange={(v) => setWf((p) => ({ ...p, phone: v }))} /></Field>
                <Field label="Emergency Contact"><Input value={wf.emergencyContact} onChange={(v) => setWf((p) => ({ ...p, emergencyContact: v }))} /></Field>
              </div>
              <Field label="Address"><Input value={wf.address} onChange={(v) => setWf((p) => ({ ...p, address: v }))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly Salary"><Input type="number" step="0.01" value={wf.salary} onChange={(v) => setWf((p) => ({ ...p, salary: v }))} /></Field>
                <Field label="Blood Group"><Input value={wf.bloodGroup} onChange={(v) => setWf((p) => ({ ...p, bloodGroup: v }))} /></Field>
                <Field label="Card ID"><Input value={wf.cardId} onChange={(v) => setWf((p) => ({ ...p, cardId: v }))} /></Field>
                <Field label="Severe Disease"><Input value={wf.severeDisease} onChange={(v) => setWf((p) => ({ ...p, severeDisease: v }))} /></Field>
                <Field label="Gender">
                  <select value={wf.gender} onChange={(e) => setWf((p) => ({ ...p, gender: e.target.value }))} className={selectClass}>
                    <option value="">— Select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Experience"><Input value={wf.experience} onChange={(v) => setWf((p) => ({ ...p, experience: v }))} /></Field>
              </div>
              <Field label="Bio">
                <textarea
                  value={wf.bio}
                  onChange={(e) => setWf((p) => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  className={`${selectClass} resize-none placeholder:text-warm-muted/40`}
                  placeholder="Short summary"
                />
              </Field>
              {workerError && <p className="text-xs text-red-400">{workerError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowWorker(false); resetWorker(); }} className="rounded-lg border border-warm-card-border px-3 py-2 text-xs text-warm-muted">Cancel</button>
              <button type="button" disabled={creatingWorker} onClick={handleCreateWorker} className="rounded-lg bg-warm-accent px-4 py-2 text-xs font-medium text-[#1a1614] disabled:opacity-50">
                {creatingWorker ? 'Adding…' : 'Add Worker'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        variant={confirm.variant}
        confirmLabel={confirm.confirmLabel}
        onConfirm={async () => {
          try {
            await confirm.action();
          } catch (e: unknown) {
            showToast('error', e instanceof Error ? e.message : 'Action failed');
          }
          setConfirm((prev) => ({ ...prev, open: false }));
        }}
        onCancel={() => setConfirm((prev) => ({ ...prev, open: false }))}
      />
    </main>
  );
}
