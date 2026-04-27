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
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { loadHistoryWithFallback } from '@/lib/history';
import { getProyeccionDelMes, PREPAGAS } from '@/lib/dashboard-data';
import { formatCurrency } from '@/lib/utils';

export function Proyeccion() {
  const { files } = loadHistoryWithFallback();
  const proyeccion = getProyeccionDelMes(files);
  const mesActual = format(new Date(), 'MMMM yyyy', { locale: es });
  const mesCapitalizado = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);

  const porcentajeCobrado = proyeccion.total > 0 ? Math.round((proyeccion.cobrado / proyeccion.total) * 100) : 0;

  const filasPrepaga = PREPAGAS.map((prepaga) => {
    const datos = proyeccion.porPrepaga.find((p) => p.prepaga.id === prepaga.id);
    return {
      prepaga,
      cantidad: datos?.cantidad ?? 0,
      monto: datos?.monto ?? 0,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proyección de cobro</CardTitle>
        <CardDescription>{mesCapitalizado}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xl md:text-2xl font-semibold tabular text-primary leading-tight break-all">
              {formatCurrency(proyeccion.cobrado)}
            </div>
            <div className="text-xs text-muted-foreground mt-2">Cobrado</div>
            <div className="text-xs text-muted-foreground">de {formatCurrency(proyeccion.total)} totales</div>
          </div>
          <div>
            <div className="text-xl md:text-2xl font-semibold tabular text-foreground leading-tight break-all">
              {formatCurrency(proyeccion.pendiente)}
            </div>
            <div className="text-xs text-muted-foreground mt-2">Pendiente</div>
            <div className="text-xs text-muted-foreground">
              {proyeccion.cantidadPendiente}{' '}
              {proyeccion.cantidadPendiente === 1 ? 'intervención' : 'intervenciones'}
            </div>
          </div>
        </div>

        <Progress value={porcentajeCobrado} className="mt-4" />

        <Separator className="my-6" />

        <h3 className="text-sm font-medium mb-3">Por prepaga</h3>
        <div className="space-y-2">
          {filasPrepaga.map(({ prepaga, cantidad, monto }) => (
            <div
              key={prepaga.id}
              className={`flex items-center justify-between py-2 ${!prepaga.disponible ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                  style={{ backgroundColor: prepaga.colorHex }}
                >
                  {prepaga.nombre.charAt(0)}
                </div>
                <span className="text-sm truncate">{prepaga.nombre}</span>
              </div>
              {prepaga.disponible ? (
                <div className="text-right">
                  <div className="tabular text-sm font-medium">{formatCurrency(monto)}</div>
                  <div className="text-xs text-muted-foreground">
                    {cantidad} {cantidad === 1 ? 'intervención' : 'intervenciones'}
                  </div>
                </div>
              ) : (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Próximamente
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" className="ml-auto text-primary hover:text-primary hover:bg-primary/10">
          Conocer más
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </CardFooter>
    </Card>
  );
}

