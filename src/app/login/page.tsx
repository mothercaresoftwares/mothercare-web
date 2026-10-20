'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { firstAllowedPath } from '@/lib/staff-permissions';
import {
  decodeJwtPayload,
  defaultLandingForRole,
  isTokenExpired,
  sanitizePostLoginRedirect,
} from '@/lib/teacher/auth-routing';
import { Building2, GraduationCap, Shield, Users } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import config from '@/config';

async function resolveAdminLanding(token: string): Promise<string> {
  try {
    const payload = decodeJwtPayload(token);
    if (!payload) return '/admin';
    const branchId = payload.branchIds?.[0];
    if (!branchId) return '/admin';
    localStorage.setItem('activeBranchId', branchId);
    const res = await api.mePermissions(branchId);
    if (res.data?.isRestricted) return firstAllowedPath(res.data);
  } catch {
    /* fall through */
  }
  return '/admin';
}

/**
 * Persist the branch + academic year this session works in.
 *
 * Every admin list is scoped by these two ids, and the backend refuses a
 * request whose academic year does not belong to the branch. The academic year
 * used to be resolved asynchronously by the admin layout, so the first request
 * of a freshly logged-in session went out without it and came back 400 —
 * which the list pages swallowed, leaving an empty roster. Resolving it here
 * makes the scope available before the first page renders.
 */
async function resolveActiveScope(token: string): Promise<void> {
  try {
    const payload = decodeJwtPayload(token);
    const branchId = payload?.branchIds?.[0];
    if (!branchId) return;
    localStorage.setItem('activeBranchId', branchId);
    const res = await api.getAcademicYears(branchId);
    const years = res.data || [];
    const active = years.find((y: any) => y.status === 'ACTIVE') || years[0];
    if (active?.id) {
      localStorage.setItem('activeAYId', active.id);
      if (active.status) localStorage.setItem('activeAYStatus', active.status);
    }
  } catch {
    /* the admin layout resolves the scope in the background if this fails */
  }
}

export function mapLoginErrorMessage(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('disabled after graduation')) {
    return 'Your account is closed after graduation. Contact school admin for archive access.';
  }
  if (lower.includes('not enrolled in any active academic year')) {
    return 'No active academic-year enrollment found for this account. Contact school admin.';
  }
  if (lower.includes('teacher profile not found') || lower.includes('teacher branch membership')) {
    return 'Teacher portal access is not set up. Contact school administration.';
  }
  if (lower.includes('invalid credentials')) {
    return 'Incorrect username or password.';
  }
  if (lower.includes('not active')) {
    return 'This account is inactive. Contact school admin.';
  }
  if (lower.includes('web portal only')) {
    return 'This account uses the web admin portal only.';
  }
  if (lower.includes('cannot reach') || lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Unable to reach the server. Please check your internet connection.';
  }
  if (lower.includes('jwt expired') || lower.includes('token expired')) {
    return 'Your session has expired. Please log in again.';
  }
  if (lower.includes('request failed (403)')) {
    return 'You do not have permission to log in.';
  }
  if (lower.includes('request failed (5')) {
    return 'Something went wrong on our end. Please try again later.';
  }
  // Fallback: only pass through if short and safe
  if (msg.length < 80 && !msg.includes('prisma') && !msg.includes('P20') && !msg.includes('http://') && !msg.includes('localhost')) {
    return msg;
  }
  return 'Login failed. Please try again or contact support.';
}

const portals = [
  { icon: Shield, label: 'CEO', desc: 'Branches, admins, API keys' },
  { icon: Building2, label: 'Admin', desc: 'Fees, attendance, results, staff' },
  { icon: GraduationCap, label: 'Teacher', desc: 'Classes, marks, mobile chat' },
  { icon: Users, label: 'Student', desc: 'Academics & mobile app' },
] as const;

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Dead (expired/malformed) token: wipe it and stay on the login form
    // instead of bouncing into a portal whose every request will 401.
    if (isTokenExpired(token)) {
      localStorage.removeItem('token');
      document.cookie = 'token=; path=/; max-age=0';
      return;
    }

    const hasCookie = document.cookie.split(';').some((c) => c.trim().startsWith('token='));
    if (!hasCookie) {
      document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    }

    try {
      const payload = decodeJwtPayload(token);
      if (payload) {
        // A previous session may have left the scope half-resolved (logout
        // clears it), so restore it before handing over to the portal.
        resolveActiveScope(token).then(() => {
          const landing = defaultLandingForRole(payload.role);
          if (landing === '/admin') {
            resolveAdminLanding(token).then((path) => router.replace(path));
          } else {
            if (landing === '/teacher' && payload.branchIds?.[0]) {
              localStorage.setItem('activeBranchId', payload.branchIds[0]);
            }
            router.replace(landing);
          }
        });
        return;
      }
    } catch {
      localStorage.removeItem('token');
      document.cookie = 'token=; path=/; max-age=0';
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim()) { setError('Enter your username, email, or phone'); return; }
    if (!password.trim()) { setError('Enter your password'); return; }

    setLoading(true);

    try {
      const data = await api.login(identifier.trim(), password);

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        document.cookie = `token=${data.token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

        // Resolve the branch + academic year before the first page renders.
        await resolveActiveScope(data.token);

        const params = new URLSearchParams(window.location.search);
        const redirect = sanitizePostLoginRedirect(params.get('redirect'));

        if (redirect) {
          router.push(redirect);
        } else {
          const payload = decodeJwtPayload(data.token);
          const landing = defaultLandingForRole(data.user?.role);
          if (landing === '/admin') {
            const path = await resolveAdminLanding(data.token);
            router.push(path);
          } else {
            if (landing === '/teacher' && payload?.branchIds?.[0]) {
              localStorage.setItem('activeBranchId', payload.branchIds[0]);
            }
            router.push(landing);
          }
        }
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cannot reach the server. Please try again.';
      setError(mapLoginErrorMessage(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1614]">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between border-r border-warm-card-border/60 p-10 lg:flex">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-warm-muted hover:text-warm-cream">
              ← {config.appName}
            </Link>
          </div>
          <div>
            <AppLogo size={120} priority className="mb-6 rounded-2xl shadow-lg shadow-black/30" />
            <h1 className="text-3xl font-light tracking-tight text-warm-cream">School Portal</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-warm-muted">
              Secure sign-in for CEO, administrators, teachers, and students. One platform for ERP,
              communication, and academics.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {portals.map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.label} className="rounded-xl border border-warm-card-border bg-warm-card/40 p-4">
                    <Icon size={18} className="mb-2 text-warm-accent" />
                    <p className="text-sm font-medium text-warm-cream">{p.label}</p>
                    <p className="mt-1 text-xs text-warm-muted">{p.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-warm-muted/50">Credentials are issued by your school only.</p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center lg:text-left">
              <AppLogo size={96} priority className="mx-auto mb-4 rounded-xl lg:hidden" />
              <h2 className="text-xl font-light text-warm-cream">Sign in</h2>
              <p className="mt-1 text-xs text-warm-muted">You will be routed to your role&apos;s portal automatically.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="id" className="mb-1.5 block text-xs text-warm-muted">Username, email, or phone</label>
                <input
                  id="id"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your identifier"
                  disabled={loading}
                  autoComplete="username"
                  className="w-full rounded-lg border border-warm-card-border bg-warm-card/30 px-3 py-2.5 text-sm text-warm-cream outline-none transition-colors placeholder:text-warm-muted/40 focus:border-warm-accent"
                />
              </div>
              <div>
                <label htmlFor="pw" className="mb-1.5 block text-xs text-warm-muted">Password</label>
                <input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-warm-card-border bg-warm-card/30 px-3 py-2.5 text-sm text-warm-cream outline-none transition-colors placeholder:text-warm-muted/40 focus:border-warm-accent"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-warm-muted">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-warm-card-border" />
                Stay signed in
              </label>
              {error && <p className="text-xs text-[#b39a76]">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-warm-accent px-6 py-2.5 text-sm font-medium text-[#1a1614] transition-colors hover:bg-[#b39a76] disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-warm-muted/60">
              <p>All credentials are managed by school admin.</p>
              <p className="mt-2">User guide &amp; API docs are available inside the portal after sign-in.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
