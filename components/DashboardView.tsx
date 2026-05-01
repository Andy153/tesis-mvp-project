'use client';

import { formatDateLong, getSaludo } from '@/lib/utils';
import { Indicadores } from '@/components/dashboard/Indicadores';
import { CalendarView } from '@/components/CalendarView';

type DashboardViewProps = {
  onNavigate?: (view: string) => void;
  onOpenFile?: (id: string) => void;
};

export function DashboardView({ onNavigate, onOpenFile }: DashboardViewProps) {
  const saludo = getSaludo('Dra. Ferreira');
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

