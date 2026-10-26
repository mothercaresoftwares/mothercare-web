'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Upload } from 'lucide-react';
import { showToast } from '@/components/toast';
import FileUpload from '@/components/file-upload';
import { AyPermissionsContext } from '@/hooks/use-ay-permissions';

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
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} step={step}
      placeholder={placeholder}
      className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors" />
  );
}

export default function NewStudentPage() {
  const router = useRouter();
  const { academicYearId } = useContext(AyPermissionsContext);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '', gender: '', dateOfBirth: '', bloodGroup: '', religion: 'Islam', nationality: 'Pakistani',
    motherTongue: '', bformCnic: '', phone: '+92 ', studentEmail: '', studentWhatsapp: '+92 ',
    address: '', city: 'Islamabad', postalCode: '45740', country: 'Pakistan',
    previousSchool: '', previousClass: '', tcNumber: '', referredBy: '',
    groupId: '', profilePhotoId: '',
    guardianName: '', guardianRelation: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // One key per mounted form: every submit attempt of the same filled form
  // carries the SAME idempotency key, so a retry after a failed or lost
  // response converges server-side on the first admission instead of
  // creating a second student. A fresh key is issued on the next mount
  // (returning to the form) — that is a genuinely new logical student.
  const idempotencyKeyRef = useRef<string | null>(null);
  const getIdemKey = () => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return idempotencyKeyRef.current;
  };

  // The class list is scoped by the academic year, so it has to be reloaded
  // whenever the year changes. Loading it once left the dropdown offering
  // classes from the previous year, and a student created into one of those
  // is invisible in the list (the list is filtered by the current year).
  useEffect(() => {
    const bId = localStorage.getItem('activeBranchId');
    // The context is the live source of truth, but it is null until the admin
    // layout resolves the year — fall back to the stored one so the class
    // dropdown is never empty on the first paint.
    const aId = academicYearId || localStorage.getItem('activeAYId');
    if (!bId || !aId) return;
    api.getSections(bId, aId)
      .then(d => {
        if (d.success) {
          setSections(d.data);
          setForm((p) => (d.data?.some((s: any) => s.id === p.groupId) ? p : { ...p, groupId: '' }));
        }
      })
      .catch(() => {});
  }, [academicYearId]);

  const set = (key: string) => (val: any) => setForm((p: any) => ({ ...p, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    if (!form.name.trim()) { showToast('error', 'Student name is required'); return; }
    if (!form.groupId) {
      setFormErrors({ groupId: 'Please select a class' });
      showToast('error', 'Class assignment is required');
      return;
    }
    setSaving(true);
    try {
      // Read the scope at submit time so it is always the branch/year the
      // admin currently has selected.
      const activeBranchId = localStorage.getItem('activeBranchId');
      const activeAYId = localStorage.getItem('activeAYId');
      const res = await api.createStudent({
        name: form.name.trim(), gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined, bloodGroup: form.bloodGroup || undefined,
        religion: form.religion || undefined, nationality: form.nationality || 'Pakistani',
        motherTongue: form.motherTongue || undefined, bformCnic: form.bformCnic || undefined,
        phone: form.phone || undefined, studentEmail: form.studentEmail || undefined,
        studentWhatsapp: form.studentWhatsapp || undefined,
        address: form.address || undefined, city: form.city || undefined,
        postalCode: form.postalCode || undefined, country: form.country || undefined,
        previousSchool: form.previousSchool || undefined, previousClass: form.previousClass || undefined,
        tcNumber: form.tcNumber || undefined, referredBy: form.referredBy || undefined,
        groupId: form.groupId || undefined, profilePhotoId: form.profilePhotoId || undefined,
        // Send the branch + academic year the admin is working in, so the
        // student is created under the same scope the list is filtered by.
        academicYearId: activeAYId || undefined,
        branchId: activeBranchId || undefined,
        guardianName: form.guardianName || undefined,
        guardianRelation: form.guardianRelation || undefined,
        idempotencyKey: getIdemKey(),
      });
      if (res.success) {
        showToast('success', 'Student created');
        // The attempt concluded — a next fill of this form must not claim
        // the same logical student.
        idempotencyKeyRef.current = null;
        router.push(`/admin/students/${res.data.id}`);
      }
    } catch (e: any) { showToast('error', e.message || 'Failed to create'); }
    finally { setSaving(false); }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <button onClick={() => router.push('/admin/students')} className="mb-6 flex items-center gap-1.5 text-xs text-warm-muted hover:text-warm-cream transition-colors">
        <ArrowLeft size={13} /> Back to Students
      </button>

      <h1 className="mb-8 text-xl font-light text-warm-cream">Add New Student</h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Photo */}
        <div>
          <p className="mb-2 text-xs text-warm-muted">Profile Photo</p>
          <FileUpload value={form.profilePhotoId} onChange={set('profilePhotoId')} label="Upload Photo" purpose="profile" entityType="student" />
        </div>

        {/* Student Identity */}
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wider text-warm-accent uppercase">Student Identity</h2>
          <div className="space-y-4">
            <Field label="Full Name" required>
              <Input value={form.name} onChange={set('name')} placeholder="e.g. Ali Hassan" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => set('gender')(e.target.value)}
                  className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none focus:border-warm-accent transition-colors">
                  <option value="">— Select —</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Date of Birth">
                <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Blood Group">
                <Input value={form.bloodGroup} onChange={set('bloodGroup')} placeholder="e.g. B+" />
              </Field>
              <Field label="Religion">
                <Input value={form.religion} onChange={set('religion')} placeholder="e.g. Islam" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nationality">
                <Input value={form.nationality} onChange={set('nationality')} placeholder="e.g. Pakistani" />
              </Field>
              <Field label="Mother Tongue">
                <Input value={form.motherTongue} onChange={set('motherTongue')} placeholder="e.g. Urdu" />
              </Field>
            </div>
            <Field label="B-Form / CNIC">
              <Input value={form.bformCnic} onChange={set('bformCnic')} placeholder="e.g. 61101-1234567-1" />
            </Field>
          </div>
        </div>

        {/* Contact */}
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wider text-warm-accent uppercase">Parent / Guardian</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Guardian Name" required>
                <Input value={form.guardianName} onChange={set('guardianName')} placeholder="e.g. Muhammad Hassan" />
              </Field>
              <Field label="Relation">
                <select value={form.guardianRelation} onChange={(e) => set('guardianRelation')(e.target.value)}
                  className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none focus:border-warm-accent transition-colors">
                  <option value="">— Select —</option>
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Guardian">Guardian</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Guardian Phone">
                <Input value={form.phone} onChange={set('phone')} placeholder="e.g. +92 300 1234567" />
              </Field>
              <Field label="Guardian Email">
                <Input value={form.studentEmail} onChange={set('studentEmail')} placeholder="e.g. parent@email.com" />
              </Field>
            </div>
            <Field label="Guardian WhatsApp">
              <Input value={form.studentWhatsapp} onChange={set('studentWhatsapp')} placeholder="e.g. +92 300 1234567" />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-warm-card-border bg-warm-card p-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wider text-warm-accent uppercase">Address</h2>
          <div className="space-y-4">
            <Field label="Address">
              <textarea value={form.address} onChange={(e) => set('address')(e.target.value)}
                placeholder="Complete address"
                className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors resize-none" rows={2} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City">
                <Input value={form.city} onChange={set('city')} placeholder="e.g. Islamabad" />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={set('country')} placeholder="e.g. Pakistan" />
              </Field>
              <Field label="Postal Code">
                <Input value={form.postalCode} onChange={set('postalCode')} placeholder="e.g. 44000" />
              </Field>
            </div>
          </div>
        </div>

        {/* Previous Education */}
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wider text-warm-accent uppercase">Previous Education</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Previous School">
                <Input value={form.previousSchool} onChange={set('previousSchool')} placeholder="e.g. Islamabad Public School" />
              </Field>
              <Field label="Previous Class">
                <Input value={form.previousClass} onChange={set('previousClass')} placeholder="e.g. Class 4" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="TC Number">
                <Input value={form.tcNumber} onChange={set('tcNumber')} placeholder="Transfer certificate no." />
              </Field>
              <Field label="Referred By">
                <Input value={form.referredBy} onChange={set('referredBy')} placeholder="e.g. Mr. Ahmed" />
              </Field>
            </div>
          </div>
        </div>

        {/* Class Assignment */}
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wider text-warm-accent uppercase">Class Assignment</h2>
          <Field label="Class / Section *">
            <select value={form.groupId} onChange={(e) => set('groupId')(e.target.value)}
              className={`w-full rounded-lg border ${formErrors.groupId ? 'border-red-500/50' : 'border-warm-card-border'} bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none focus:border-warm-accent transition-colors`}>
              <option value="">— Select Class —</option>
              {sections.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}{s.section ? ` — ${s.section}` : ''}</option>
              ))}
            </select>
            {formErrors.groupId && <p className="mt-1 text-[10px] text-red-400">{formErrors.groupId}</p>}
          </Field>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push('/admin/students')}
            className="rounded-lg border border-warm-card-border px-5 py-2.5 text-xs text-warm-muted hover:text-warm-cream transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-warm-accent px-5 py-2.5 text-xs font-medium text-[#1a1614] hover:bg-[#b39a76] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Create Student'}
          </button>
        </div>
      </form>
    </main>
  );
}
