'use client';

import { createContext, useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  canCrud,
  isAyReadOnlyForPath,
  moduleForPathname,
  type CrudAction,
  type StaffAccess,
  type StaffModuleKey,
} from '@/lib/staff-permissions';

type AyPermissionsContextValue = {
  staffAccess: StaffAccess | null;
  ayStatus: string | null;
  /**
   * The academic year the admin is currently working in, or null while the
   * layout is still resolving it. List pages scope their requests by this id,
   * so exposing it lets them refetch when the year is switched (or arrives
   * late) instead of reading a stale value out of localStorage.
   */
  academicYearId: string | null;
};

export const AyPermissionsContext = createContext<AyPermissionsContextValue>({
  staffAccess: null,
  ayStatus: null,
  academicYearId: null,
});

export function AyPermissionsProvider({
  children,
  staffAccess,
  ayStatus,
  academicYearId,
}: {
  children: React.ReactNode;
  staffAccess: StaffAccess | null;
  ayStatus: string | null;
  academicYearId?: string | null;
}) {
  const value = useMemo(
    () => ({ staffAccess, ayStatus, academicYearId: academicYearId ?? null }),
    [staffAccess, ayStatus, academicYearId],
  );
  return (
    <AyPermissionsContext.Provider value={value}>
      {children}
    </AyPermissionsContext.Provider>
  );
}

export function useAyPermissions(moduleOverride?: StaffModuleKey) {
  const { staffAccess, ayStatus } = useContext(AyPermissionsContext);
  const pathname = usePathname();
  const staffModule = moduleOverride ?? moduleForPathname(pathname);
  const archived = ayStatus === 'ARCHIVED';

  const can = (action: CrudAction) => {
    if (!staffModule) return !staffAccess?.isRestricted;
    return canCrud(staffAccess, staffModule, action, { archived });
  };

  const readOnly = isAyReadOnlyForPath(staffAccess, pathname, ayStatus);

  return {
    module: staffModule,
    ayStatus,
    isArchived: archived,
    isBuildStage: ayStatus === 'BUILD_STAGE',
    readOnly,
    canCreate: can('create'),
    canUpdate: can('update'),
    canDelete: can('delete'),
    canRead: staffModule ? can('read') : true,
  };
}
