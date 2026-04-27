'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  Clock,
  ShieldAlert,
} from 'lucide-react';

import { loadHistoryWithFallback } from '@/lib/history';
import { getDocumentosQueRequierenAtencion, type AtencionItem } from '@/lib/dashboard-data';

const ICONOS: Record<AtencionItem['tipo'], { Icon: typeof AlertCircle; className: string }> = {
  error: { Icon: AlertCircle, className: 'text-destructive' },
  warning: { Icon: AlertTriangle, className: 'text-amber-600' },
  autorizacion: { Icon: ShieldAlert, className: 'text-amber-600' },
  plazo: { Icon: Clock, className: 'text-amber-600' },
};

export function Atencion() {
  const { files } = loadHistoryWithFallback();
  const itemsTop = getDocumentosQueRequierenAtencion(files, 5);
  const totalItems = getDocumentosQueRequierenAtencion(files).length;
  const hayMasItems = totalItems > 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos que requieren atención</CardTitle>
        <CardDescription>Resolvé estos pendientes para evitar demoras en tus cobros</CardDescription>
      </CardHeader>
      <CardContent>
        {itemsTop.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CircleCheck className="h-12 w-12 text-primary mb-3" />
            <p className="text-sm font-medium">Todo en orden</p>
            <p className="text-xs text-muted-foreground mt-1">No hay pendientes para resolver.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {itemsTop.map((item) => {
              const { Icon, className } = ICONOS[item.tipo];
              return (
                <div
                  key={item.id}
                  className="border border-border rounded-lg p-4 flex flex-col gap-2 hover:border-primary/40 transition-colors min-h-[160px]"
                >
                  <Icon className={`h-5 w-5 ${className}`} />
                  <div className="text-sm font-medium leading-tight line-clamp-2">{item.titulo}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{item.descripcion}</div>
                  <div className="text-xs text-muted-foreground mt-auto">{item.fechaRelativa}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start px-0 h-auto text-xs text-primary hover:text-primary hover:bg-primary/10 mt-1"
                  >
                    Revisar
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      {hayMasItems && (
        <CardFooter>
          <Button variant="ghost" size="sm" className="ml-auto text-primary hover:text-primary hover:bg-primary/10">
            Ver todos ({totalItems})
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

