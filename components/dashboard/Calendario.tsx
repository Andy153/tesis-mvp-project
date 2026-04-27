'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowRight } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { loadHistoryWithFallback } from '@/lib/history';
import { getCobrosDelMesPorDia, PREPAGAS } from '@/lib/dashboard-data';
import { formatCurrency } from '@/lib/utils';

export function Calendario() {
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { files } = loadHistoryWithFallback();
  const cobrosPorDia = getCobrosDelMesPorDia(files);

  const cantidadCobros = cobrosPorDia.reduce((acc, dia) => acc + dia.items.length, 0);
  const totalEstimado = cobrosPorDia.reduce(
    (acc, dia) => acc + dia.items.reduce((sum, item) => sum + item.monto, 0),
    0,
  );

  const diasConCobros = cobrosPorDia.map((dia) => parseISO(dia.fecha));

  const itemsDelDia = diaSeleccionado
    ? cobrosPorDia.find((dia) => isSameDay(parseISO(dia.fecha), diaSeleccionado))?.items ?? []
    : [];

  const getColorPrepaga = (prepagaId: string) => {
    return PREPAGAS.find((p) => p.id === prepagaId)?.colorHex ?? '#2A6B52';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximos cobros</CardTitle>
        <CardDescription>Cobros estimados según plazos de cada prepaga</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Este mes tenés{' '}
          <strong className="text-foreground tabular">{cantidadCobros} cobros estimados</strong> por un total de{' '}
          <strong className="text-foreground tabular">{formatCurrency(totalEstimado)}</strong>.
        </p>

        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <div>
              <Calendar
                mode="single"
                selected={diaSeleccionado}
                onSelect={(day) => {
                  if (!day) return;
                  const tieneCobros = cobrosPorDia.some((dia) => isSameDay(parseISO(dia.fecha), day));
                  if (tieneCobros) {
                    setDiaSeleccionado(day);
                    setPopoverOpen(true);
                  }
                }}
                locale={es}
                weekStartsOn={1}
                modifiers={{ cobro: diasConCobros }}
                modifiersClassNames={{
                  cobro:
                    'relative font-semibold after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-primary',
                }}
                className="w-full rounded-md"
                classNames={{
                  months: 'w-full',
                  month: 'w-full space-y-4',
                  table: 'w-full border-collapse',
                  head_row: 'flex w-full',
                  head_cell: 'text-muted-foreground rounded-md w-full font-normal text-xs uppercase',
                  row: 'flex w-full mt-1',
                  cell: 'flex-1 text-center text-sm relative p-0 focus-within:relative focus-within:z-20',
                  day: 'h-10 w-full p-0 font-normal hover:bg-accent hover:text-accent-foreground rounded-md transition-colors',
                  day_selected: 'bg-primary text-primary-foreground hover:bg-primary',
                  day_today: 'ring-1 ring-primary',
                }}
              />
            </div>
          </PopoverTrigger>
          {itemsDelDia.length > 0 && (
            <PopoverContent className="w-80" align="center">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {diaSeleccionado && format(diaSeleccionado, "EEEE d 'de' MMMM", { locale: es })}
                </p>
                {itemsDelDia
                  .sort((a, b) => b.monto - a.monto)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: getColorPrepaga(item.prepagaId) }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{item.pacienteIniciales}</div>
                          <div className="text-xs text-muted-foreground truncate">{item.tipo}</div>
                        </div>
                      </div>
                      <div className="text-sm font-medium tabular shrink-0">{formatCurrency(item.monto)}</div>
                    </div>
                  ))}
              </div>
            </PopoverContent>
          )}
        </Popover>
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

