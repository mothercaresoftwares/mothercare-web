'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  GraduationCap, Search, BookOpen, ExternalLink, ArrowLeft, RotateCcw,
} from 'lucide-react';
import { showToast } from '@/components/toast';
import ConfirmModal from '@/components/confirm-modal';

interface DeactivatedStudent {
  id: string;
  admissionNumber: string | null;
  rollNumber: string | null;
  name: string;
  status: string;
  group: { id: string; name: string; section: string | null } | null;
  _count?: { enrollments: number };
}

/**
 * Separate archive for deactivated students (WITHDRAWN / SUSPENDED / EXPELED /
 * TRANSFERRED / GRADUATED / DECEASED) — kept apart from the active Students
 * list so the two never mix. Lists ?status=inactive only.
 * (Static route wins over [id], so /deactivated never collides with a profile.)
 */
export default function DeactivatedStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<DeactivatedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string;
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', action: async () => {} });

  useEffect(() => { loadStudents(); }, []);

  const loadStudents = (page: number = meta.page) => {
    const params: { search?: string; page?: number; limit?: number; status: 'inactive' } = {
      status: 'inactive',
      page,
      limit: meta.limit,
    };
    if (search) params.search = search;

    api.getStudents(params).then(d => {
      if (d.success) {
        setStudents(d.data || []);
        setMeta(d.meta);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const goToPage = (p: number) => {
    setMeta(m => ({ ...m, page: p }));
    setLoading(true);
    loadStudents(p);
  };

  const handleSearch = () => {
    setLoading(true);
    setMeta(m => ({ ...m, page: 1 }));
    loadStudents(1);
  };

  const promptReactivate = (s: DeactivatedStudent) => {
    setConfirm({
      open: true,
      title: `Reactivate "${s.name}"?`,
      message: `Their status returns to ACTIVE and login is restored. Past status history is preserved.`,
      variant: 'default',
      confirmLabel: 'Reactivate',
      action: async () => {
        try {
          await api.reactivateStudent(s.id);
          showToast('success', `"${s.name}" reactivated`);
          loadStudents();
        } catch (e: unknown) {
          showToast('error', e instanceof Error ? e.message : 'Failed to reactivate');
        }
      },
    });
  };

  const promptDelete = (s: DeactivatedStudent) => {
    if ((s._count?.enrollments ?? 0) > 0) {
      showToast('error', 'Cannot delete: student has enrollment history. Keep them deactivated instead.');
      return;
    }
    setConfirm({
      open: true,
      title: `Permanently Delete "${s.name}"?`,
      message: `This student has no enrollment history. Their record will be permanently removed. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete Permanently',
      action: async () => {
        try {
          await api.deleteStudent(s.id);
          showToast('success', 'Student deleted permanently');
          loadStudents();
        } catch (e: unknown) {
          showToast('error', e instanceof Error ? e.message : 'Failed to delete');
        }
      },
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/admin/students"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-warm-muted hover:text-warm-cream transition-colors"
      >
        <ArrowLeft size={13} /> Back to Students
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-light text-warm-cream">Deactivated Students</h1>
        <p className="text-sm text-warm-muted">
          Login disabled, records retained. Reactivate anyone to restore their access, or permanently
          delete students with no enrollment history.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-muted" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or admission number…"
            className="w-full rounded-lg border border-warm-card-border bg-[#1a1614] py-2 pl-9 pr-3 text-sm text-warm-cream outline-none placeholder:text-warm-muted/40 focus:border-warm-accent transition-colors"
          />
        </div>
        <button onClick={handleSearch} className="rounded-lg border border-warm-card-border px-4 py-2 text-xs text-warm-muted hover:text-warm-cream transition-colors">
          Search
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-xl bg-warm-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && students.length === 0 && (
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-8 text-center">
          <GraduationCap size={32} className="mx-auto mb-3 text-warm-muted" />
          <p className="text-sm text-warm-muted">No deactivated students.</p>
          <Link href="/admin/students" className="mt-4 inline-block text-xs text-warm-accent hover:underline">
            Back to active students
          </Link>
        </div>
      )}

      {/* Student cards */}
      {!loading && students.length > 0 && (
        <div className="space-y-3">
          {students.map(s => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-warm-card-border bg-warm-card p-4 transition-colors hover:bg-warm-card/80">
              <button onClick={() => router.push(`/admin/students/${s.id}`)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warm-accent/10">
                  <GraduationCap size={18} className="text-warm-accent" />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-warm-cream truncate">
                    {s.name}
                    {s.admissionNumber && <span className="text-[10px] text-warm-muted/60 font-normal">({s.admissionNumber})</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-warm-muted mt-0.5">
                    {s.group && (
                      <span className="inline-flex items-center gap-1">
                        <BookOpen size={10} /> {s.group.name}{s.group.section ? ` — ${s.group.section}` : ''}
                      </span>
                    )}
                    {s.rollNumber && <span>Roll: {s.rollNumber}</span>}
                    <span className="inline-flex items-center gap-1 text-warm-muted/50">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-500" />
                      {s.status.toLowerCase()}
                    </span>
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={() => promptReactivate(s)}
                  className="flex items-center gap-1.5 rounded-lg border border-green-900/30 bg-green-900/10 px-3 py-1.5 text-[11px] text-green-400 hover:bg-green-900/20 transition-colors"
                  title="Reactivate student"
                >
                  <RotateCcw size={12} /> Reactivate
                </button>
                {(s._count?.enrollments ?? 0) === 0 && (
                  <button onClick={() => promptDelete(s)} className="rounded-lg p-1.5 text-warm-muted hover:text-red-400 hover:bg-warm-card-border/30 transition-colors" title="Delete permanently">
                    <span className="text-[11px]">✕</span>
                  </button>
                )}
                <button onClick={() => router.push(`/admin/students/${s.id}`)} className="rounded-lg p-1.5 text-warm-muted hover:text-warm-cream hover:bg-warm-card-border/30 transition-colors" title="View details">
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-warm-muted">
                {meta.total} deactivated student{meta.total !== 1 ? 's' : ''} · Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={meta.page <= 1}
                  onClick={() => goToPage(meta.page - 1)}
                  className="rounded-lg border border-warm-card-border px-3 py-1.5 text-xs text-warm-muted hover:text-warm-cream disabled:opacity-30 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => goToPage(meta.page + 1)}
                  className="rounded-lg border border-warm-card-border px-3 py-1.5 text-xs text-warm-muted hover:text-warm-cream disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
