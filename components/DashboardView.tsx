'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { formatDateLong, getSaludo } from '@/lib/utils';
import { Indicadores } from '@/components/dashboard/Indicadores';
import { CalendarView } from '@/components/CalendarView';
import { loadProfile } from '@/lib/profile';
import { useMounted } from '@/lib/use-mounted';

type DashboardViewProps = {
  onNavigate?: (view: string) => void;
  onOpenFile?: (id: string) => void;
};

export function DashboardView({ onNavigate, onOpenFile }: DashboardViewProps) {
  const mounted = useMounted();
  const { user, isLoaded } = useUser();
  const [profileName, setProfileName] = useState('');
  useEffect(() => {
    setProfileName(loadProfile().displayName);
  }, []);

  const clerkNombre =
    isLoaded && user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.fullName?.trim() || ''
      : '';
  const saludo = getSaludo(mounted ? (profileName || '').trim() || clerkNombre : '');
  const fechaHoy = formatDateLong(new Date());

  return (
    <div className="px-6 md:px-10 pt-6 pb-10 max-w-[1600px] mx-auto">
      <div className="page-head mb-16">
        <div>
          <h1 className="page-title">Resumen general</h1>
          <p className="page-subtitle">
            {saludo} · {fechaHoy}
          </p>
        </div>
      </div>

      <div className="space-y-20">
        <Indicadores onNavigate={onNavigate} />

        <section className="panel" style={{ padding: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: 'var(--text)' }}>Vista por fechas</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Tus documentos agrupados por fecha de carga.
            </div>
          </div>
          <CalendarView embedded onOpenParte={onOpenFile} />
        </section>
      </div>
    </div>
  );
}

