'use client';

import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Lock } from 'lucide-react';
import Image from 'next/image';
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

  const swiss = PREPAGAS.find((p) => p.id === 'swiss')!;
  const osde = PREPAGAS.find((p) => p.id === 'osde')!;
  const swissDatos = proyeccion.porPrepaga.find((p) => p.prepaga.id === 'swiss');
  const swissCantidad = swissDatos?.cantidad ?? 0;
  const swissMonto = swissDatos?.monto ?? 0;

  return (
    <section className="panel mt-[15px] mb-[15px]" style={{ padding: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: 'var(--text)' }}>Proyección de cobro</div>
        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>{mesCapitalizado}</div>
      </div>
      <div>
        <div className="proj-summary-grid">
          <div className="panel" style={{ padding: 16, background: 'var(--bg-sunken)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-soft)', fontWeight: 700 }}>
              Cobrado
            </div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1 }} className="tabular proj-kpi-value">
              {formatCurrency(proyeccion.cobrado)}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              de <span className="tabular">{formatCurrency(proyeccion.total)}</span> totales
            </div>
          </div>
          <div className="panel" style={{ padding: 16, background: 'var(--bg-sunken)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-soft)', fontWeight: 700 }}>
              Pendiente
            </div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }} className="tabular proj-kpi-value">
              {formatCurrency(proyeccion.pendiente)}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="tabular">{proyeccion.cantidadPendiente}</span>{' '}
              {proyeccion.cantidadPendiente === 1 ? 'intervención' : 'intervenciones'}
            </div>
          </div>
        </div>

        <Progress value={porcentajeCobrado} className="mt-4" />

        <Separator className="my-6" />

        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-soft)',
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Por prepaga
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {/* Swiss Medical (activa) */}
          <div
            className="panel"
            data-proj-prepaga-row
            style={{
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderColor: 'var(--border)',
              background: 'var(--bg-panel)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              {/* Logo placeholder */}
              <div
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-sunken)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
                title="Swiss Medical"
              >
                <Image
                  src="/logos/swiss-medical.png"
                  alt="Swiss Medical"
                  width={28}
                  height={28}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{swiss.nombre}</span>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: swiss.colorHex, opacity: 0.8 }} />
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span className="tabular">{swissCantidad}</span> {swissCantidad === 1 ? 'intervención' : 'intervenciones'}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }} data-proj-prepaga-right>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-soft)' }}>Estimado</div>
              <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--accent-ink)' }} className="tabular">
                {formatCurrency(swissMonto)}
              </div>
            </div>
          </div>

          {/* OSDE (no disponible) */}
          <div
            className="panel"
            data-proj-prepaga-row
            style={{
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderColor: 'var(--border)',
              background: 'var(--bg-panel)',
              opacity: 0.55,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              {/* Logo placeholder */}
              <div
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-sunken)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
                title="OSDE (próximamente)"
              >
                <Image src="/logos/osde.png" alt="OSDE" width={28} height={28} style={{ objectFit: 'contain' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{osde.nombre}</span>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--text-soft)', opacity: 0.7 }} />
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={14} /> Próximamente
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }} data-proj-prepaga-right>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-soft)' }}>Estimado</div>
              <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--text-soft)' }} className="tabular">
                —
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>
          Conocer más <span aria-hidden>→</span>
        </button>
      </div>
    </section>
  );
}

