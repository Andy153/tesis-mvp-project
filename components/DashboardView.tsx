'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateLong, getSaludo } from '@/lib/utils';
import { CtaCarga } from '@/components/dashboard/CtaCarga';
import { Proyeccion } from '@/components/dashboard/Proyeccion';
import { Calendario } from '@/components/dashboard/Calendario';
import { Atencion } from '@/components/dashboard/Atencion';

type DashboardViewProps = {
  onNavigate?: (view: string) => void;
};

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const saludo = getSaludo('Dra. Ferreira');
  const fechaHoy = formatDateLong(new Date());

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{saludo}</h1>
        <p className="text-sm text-muted-foreground mt-1">{fechaHoy}</p>
      </header>

      {/* CTA — full width */}
      <div className="mb-6">
        <CtaCarga onComenzar={() => onNavigate?.('upload')} />
      </div>

      {/* Calendario + Proyección (60/40) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <Calendario />
        </div>

        <Proyeccion />
      </div>

      {/* Atención — full width */}
      <Atencion />
    </div>
  );
}

