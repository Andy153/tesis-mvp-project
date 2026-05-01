'use client';

import { formatDateLong, getSaludo } from '@/lib/utils';
import { Indicadores } from '@/components/dashboard/Indicadores';
import { Proyeccion } from '@/components/dashboard/Proyeccion';
import { Calendario } from '@/components/dashboard/Calendario';
import { Atencion } from '@/components/dashboard/Atencion';

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

        {/* Calendario + Proyección (60/40) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
          <div className="lg:col-span-2">
            <Calendario />
          </div>
          <Proyeccion />
        </div>

        {/* Atención — full width */}
        <Atencion onNavigate={onNavigate} onOpenFile={onOpenFile} />
      </div>
    </div>
  );
}

