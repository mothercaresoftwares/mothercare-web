'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Plus, Users, GraduationCap, BookOpen, Search, Filter, Printer, UserX } from 'lucide-react';
import { showToast } from '@/components/toast';
import ConfirmModal from '@/components/confirm-modal';

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string;
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', action: async () => {} });

  const branchId = typeof window !== 'undefined' ? localStorage.getItem('activeBranchId') : null;
  const ayId = typeof window !== 'undefined' ? localStorage.getItem('activeAYId') : null;

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await api.getStudents({
        search: search || undefined,
        groupId: groupId || undefined,
        rollNumber: rollNumber || undefined,
        limit: -1,
        status: 'active',
      });
      if (res.success) setStudents(res.data);
    } catch {} finally { setLoading(false); }
  };

  const loadInactiveCount = () => {
    api.getStudents({ status: 'inactive', limit: 1 }).then(d => {
      if (d.success) setInactiveCount(d.meta?.total ?? 0);
    }).catch(() => {});
  };

  useEffect(() => { loadStudents(); loadInactiveCount(); }, [groupId, rollNumber]);

  useEffect(() => {
    if (branchId && ayId) {
      api.getSections(branchId, ayId).then(d => { if (d.success) setSections(d.data); }).catch(() => {});
    }
  }, []);

  const promptDeactivate = (student: any) => {
    setConfirm({
      open: true,
      title: `Deactivate "${student.name}"?`,
      message: `Their status becomes WITHDRAWN and login is disabled. Records are preserved — they can be reactivated later from the Deactivated page.`,
      variant: 'warning',
      confirmLabel: 'Deactivate',
      action: async () => {
        try {
          await api.deactivateStudent(student.id);
          showToast('success', `"${student.name}" deactivated`);
          loadStudents();
          loadInactiveCount();
        } catch (e: any) {
          showToast('error', e.message || 'Failed to deactivate');
        }
      },
    });
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-warm-accent" />
          <h1 className="text-xl font-light text-warm-cream">Students</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/admin/students/admission-form')}
            className="flex items-center gap-1.5 rounded-lg border border-warm-card-border px-4 py-2 text-xs text-warm-muted hover:text-warm-cream transition-colors">
            <Printer size={14} /> Print Admission Form
          </button>
          <button onClick={() => router.push('/admin/students/deactivated')}
            className="flex items-center gap-1.5 rounded-lg border border-warm-card-border px-4 py-2 text-sm text-warm-muted hover:text-warm-cream transition-colors"
            title="View deactivated students">
            <UserX size={15} /> Deactivated
            {inactiveCount > 0 && (
              <span className="rounded-full bg-warm-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-warm-accent">
                {inactiveCount}
              </span>
            )}
          </button>
          <button onClick={() => router.push('/admin/students/new')}
            className="flex items-center gap-1.5 rounded-lg bg-warm-accent px-4 py-2 text-xs font-medium text-[#1a1614] hover:bg-[#b39a76] transition-colors">
            <Plus size={14} /> Add Student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or admission..."
            className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] pl-9 pr-3 py-2 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors" />
        </div>
        <div className="min-w-[160px]">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
            className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none focus:border-warm-accent transition-colors">
            <option value="">All Classes</option>
            {sections.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}{s.section ? ` — ${s.section}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
          <input type="text" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)}
            placeholder="Roll no."
            className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] px-3 py-2 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors" />
        </div>
        <button onClick={loadStudents}
          className="flex items-center gap-1.5 rounded-lg border border-warm-card-border px-4 py-2 text-xs text-warm-muted hover:text-warm-cream transition-colors">
          <Filter size={13} /> Filter
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-warm-card" />)}
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-12 text-center">
          <Users size={32} className="mx-auto mb-3 text-warm-muted" />
          <p className="text-sm text-warm-muted">No students found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map(student => (
            <div key={student.id} onClick={() => router.push(`/admin/students/${student.id}`)}
              className="group relative rounded-xl border border-warm-card-border bg-warm-card p-4 cursor-pointer hover:border-warm-accent/40 transition-colors">
              <button
                onClick={(e) => { e.stopPropagation(); promptDeactivate(student); }}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-warm-muted opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-warm-card-border/30 transition-all"
                title="Deactivate student"
              >
                <UserX size={14} />
              </button>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warm-accent/10">
                  <GraduationCap size={18} className="text-warm-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-cream truncate">{student.name}</p>
                  <p className="text-[11px] text-warm-muted/60">{student.admissionNumber || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-warm-muted">
                {student.group && (
                  <span className="flex items-center gap-1">
                    <BookOpen size={11} className="text-warm-accent" />
                    {student.group.name}{student.group.section ? ` — ${student.group.section}` : ''}
                  </span>
                )}
                {student.rollNumber && (
                  <>
                    <span className="text-warm-muted/30">|</span>
                    <span className="text-green-400">Roll: {student.rollNumber}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        variant={confirm.variant}
        confirmLabel={confirm.confirmLabel}
        onConfirm={async () => { await confirm.action(); setConfirm(prev => ({ ...prev, open: false })); }}
        onCancel={() => setConfirm(prev => ({ ...prev, open: false }))}
      />
    </main>
  );
}
