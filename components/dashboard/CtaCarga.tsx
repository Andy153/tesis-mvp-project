'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Upload } from 'lucide-react';

type Props = {
  onComenzar: () => void;
};

export function CtaCarga({ onComenzar }: Props) {
  return (
    <section className="panel" style={{ padding: 18, background: 'var(--accent-soft)', borderColor: 'var(--border)' }}>
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Iniciar proceso de carga de datos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Subí los comprobantes de tus últimas intervenciones. Trazá detecta errores antes de presentarlos.
          </p>
        </div>
        <Button size="lg" onClick={onComenzar} className="md:w-auto w-full">
          Comenzar
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

