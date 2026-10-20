'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Shield, Search, ExternalLink, ArrowLeft, RotateCcw, UserX,
} from 'lucide-react';
import { showToast } from '@/components/toast';
import ConfirmModal from '@/components/confirm-modal';

interface DeactivatedStaff {
  userId: string;
  branchMemberId: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  branchRole: string;
  employeeId?: string | null;
  workRole?: string | null;
  qualification?: string | null;
}

/**
 * Separate archive for deactivated staff — kept apart from the active Staff
 * list so the two never mix. Lists ?status=inactive only.
 * (Static route wins over [id], so /deactivated never collides with a profile.)
 *
 * Deletion is permanent and only allowed when the backend guard finds no
 * attendance or payroll history — the server is authoritative, so the button
 * is always shown here and a guarded delete surfaces the reason as a toast.
 */
export default function DeactivatedStaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<DeactivatedStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string;
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string; action: () => Promise<void>;
  }>({ open: false, title: '', message: '', variant: 'default', confirmLabel: 'Confirm', action: async () => {} });

  const loadStaff = useCallback(() => {
    setLoading(true);
    api.getStaffList({ status: 'inactive', search: search.trim() || undefined })
      .then((r) => setStaff(r.data || []))
      .catch((e) => showToast('error', e.message))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleSearch = () => {
    setLoading(true);
    loadStaff();
  };

  const promptReactivate = (s: DeactivatedStaff) => {
    setConfirm({
      open: true,
      title: `Reactivate "${s.name}"?`,
      message: 'Their login and branch access will be restored with existing module permissions.',
      variant: 'default',
      confirmLabel: 'Reactivate',
      action: async () => {
        try {
          await api.reactivateStaffMember(s.userId);
          showToast('success', `"${s.name}" reactivated`);
          loadStaff();
        } catch (e: unknown) {
          showToast('error', e instanceof Error ? e.message : 'Failed to reactivate');
        }
      },
    });
  };

  const promptDelete = (s: DeactivatedStaff) => {
    setConfirm({
      open: true,
      title: `Permanently Delete "${s.name}"?`,
      message: 'This staff member will be permanently removed. This cannot be undone. Staff with attendance or payroll history cannot be deleted.',
      variant: 'danger',
      confirmLabel: 'Delete Permanently',
      action: async () => {
        try {
          await api.deleteStaffMember(s.userId);
          showToast('success', 'Staff deleted permanently');
          loadStaff();
        } catch (e: unknown) {
          showToast('error', e instanceof Error ? e.message : 'Failed to delete');
        }
      },
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/admin/staff"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-warm-muted hover:text-warm-cream transition-colors"
      >
        <ArrowLeft size={13} /> Back to Staff
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-light text-warm-cream">Deactivated Staff</h1>
        <p className="text-sm text-warm-muted">
          Login disabled, records retained. Reactivate anyone to restore their access, or permanently
          delete staff with no attendance or payroll history.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-muted" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, username, or employee ID…"
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
      {!loading && staff.length === 0 && (
        <div className="rounded-xl border border-warm-card-border bg-warm-card p-8 text-center">
          <UserX size={32} className="mx-auto mb-3 text-warm-muted" />
          <p className="text-sm text-warm-muted">No deactivated staff.</p>
          <Link href="/admin/staff" className="mt-4 inline-block text-xs text-warm-accent hover:underline">
            Back to active staff
          </Link>
        </div>
      )}

      {/* Staff cards */}
      {!loading && staff.length > 0 && (
        <div className="space-y-3">
          {staff.map(s => (
            <div key={s.userId} className="flex items-center justify-between rounded-xl border border-warm-card-border bg-warm-card p-4 transition-colors hover:bg-warm-card/80">
              <button onClick={() => router.push(`/admin/staff/${s.userId}`)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                  <Shield size={18} className="text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-warm-cream truncate">
                    {s.name}
                    {s.branchRole === 'worker' && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-normal text-amber-400">Worker</span>
                    )}
                    {s.employeeId && <span className="text-[10px] text-warm-muted/60 font-normal">({s.employeeId})</span>}
                    {s.username && <span className="text-[10px] text-warm-muted/60 font-normal">@{s.username}</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-warm-muted mt-0.5">
                    {s.workRole && <span>{s.workRole}</span>}
                    {s.qualification && <span>{s.qualification}</span>}
                    <span className="inline-flex items-center gap-1 text-warm-muted/50">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-500" />
                      {s.status}
                    </span>
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={() => promptReactivate(s)}
                  className="flex items-center gap-1.5 rounded-lg border border-green-900/30 bg-green-900/10 px-3 py-1.5 text-[11px] text-green-400 hover:bg-green-900/20 transition-colors"
                  title="Reactivate staff"
                >
                  <RotateCcw size={12} /> Reactivate
                </button>
                <button
                  onClick={() => promptDelete(s)}
                  className="rounded-lg p-1.5 text-warm-muted hover:text-red-400 hover:bg-warm-card-border/30 transition-colors"
                  title="Delete permanently"
                >
                  <span className="text-[11px]">✕</span>
                </button>
                <button onClick={() => router.push(`/admin/staff/${s.userId}`)} className="rounded-lg p-1.5 text-warm-muted hover:text-warm-cream hover:bg-warm-card-border/30 transition-colors" title="View details">
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ))}

          <p className="pt-2 text-xs text-warm-muted">
            {staff.length} deactivated staff
          </p>
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
