'use client';

import {
  lastMesIndexConCobro,
  type CobrosEvolucionPoint,
} from '@/lib/cobros-centro-evolucion-shared';
import { formatCurrency } from '@/lib/utils';

const H = 160;
const PAD = { t: 14, r: 12, b: 34, l: 52 };

function chartWidth(pointCount: number): number {
  const min = 320;
  const perPoint = 38;
  return Math.max(min, PAD.l + PAD.r + Math.max(0, pointCount - 1) * perPoint);
}

function scaleY(value: number, max: number, innerH: number): number {
  if (max <= 0) return PAD.t + innerH;
  return PAD.t + innerH - (value / max) * innerH;
}

function polylineUpToIndex(
  values: number[],
  lastIndex: number,
  totalSlots: number,
  max: number,
  innerW: number,
  innerH: number,
): string {
  if (lastIndex < 0 || totalSlots < 1) return '';
  const step = totalSlots > 1 ? innerW / (totalSlots - 1) : 0;
  const coords: string[] = [];
  for (let i = 0; i <= lastIndex; i++) {
    const x = PAD.l + (totalSlots > 1 ? i * step : innerW / 2);
    const y = scaleY(values[i] ?? 0, max, innerH);
    coords.push(`${x},${y}`);
  }
  return coords.join(' ');
}

function axisTicks(max: number): number[] {
  if (max <= 0) return [0];
  if (max <= 1) return [0, 1];
  if (max <= 5) {
    const step = max <= 2 ? 0.5 : 1;
    const ticks: number[] = [];
    for (let v = 0; v <= max + 0.001; v += step) ticks.push(v);
    return ticks;
  }
  return [0, max / 2, max];
}

function formatAxisVal(val: number, max: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (val >= 1000) return `${Math.round(val / 1000)}k`;
  if (max <= 5 && val > 0 && val < 10 && !Number.isInteger(val)) {
    return val.toFixed(1).replace(/\.0$/, '');
  }
  return String(Math.round(val));
}

export function CobrosEvolucionChart({
  points,
  loading,
  highlightMes,
}: {
  points: CobrosEvolucionPoint[];
  loading?: boolean;
  highlightMes?: string;
}) {
  const W = chartWidth(points.length);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const lastIdx = lastMesIndexConCobro(points);
  const max = Math.max(
    1,
    ...points
      .slice(0, lastIdx + 1)
      .flatMap((p) => [p.montoCobrados, p.montoPipeline]),
  );
  const ticks = axisTicks(max);

  const cobradosVals = points.map((p) => p.montoCobrados);
  const pipelineVals = points.map((p) => p.montoPipeline);
  const hi = highlightMes ? points.findIndex((p) => p.mes === highlightMes) : -1;
  const n = points.length;
  const step = n > 1 ? innerW / (n - 1) : 0;

  if (loading) {
    return (
      <div className="cobros-evolucion-chart cobros-evolucion-chart--loading">
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando evolución…</div>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="cobros-evolucion-chart cobros-evolucion-chart--empty">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.45 }}>
          Sin datos de evolución.
        </div>
      </div>
    );
  }

  return (
    <div className="cobros-evolucion-chart">
      <div className="cobros-evolucion-chart__head">
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--text-soft)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Evolución mensual
        </div>
        <div className="cobros-evolucion-chart__legend">
          <span className="cobros-evolucion-chart__legend-item">
            <span className="cobros-evolucion-chart__dot cobros-evolucion-chart__dot--cobrados" />
            Cobrado
          </span>
          <span className="cobros-evolucion-chart__legend-item">
            <span className="cobros-evolucion-chart__dot cobros-evolucion-chart__dot--pipeline" />
            + en trámite
          </span>
        </div>
      </div>
      <div className="cobros-evolucion-chart__svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label="Gráfico de evolución de cobros por mes"
          style={{ display: 'block' }}
          preserveAspectRatio="xMinYMid meet"
        >
          {ticks.map((val) => {
            const frac = max > 0 ? val / max : 0;
            const y = PAD.t + innerH * (1 - frac);
            return (
              <g key={val}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <text x={PAD.l - 8} y={y + 3.5} textAnchor="end" fontSize={9} fill="var(--text-soft)">
                  {formatAxisVal(val, max)}
                </text>
              </g>
            );
          })}
          {lastIdx >= 0 ? (
            <>
              <polyline
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylineUpToIndex(pipelineVals, lastIdx, n, max, innerW, innerH)}
              />
              <polyline
                fill="none"
                stroke="rgb(34, 197, 94)"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylineUpToIndex(cobradosVals, lastIdx, n, max, innerW, innerH)}
              />
            </>
          ) : null}
          {points.map((p, i) => {
            const x = PAD.l + (n > 1 ? i * step : innerW / 2);
            const yC = scaleY(p.montoCobrados, max, innerH);
            const yP = scaleY(p.montoPipeline, max, innerH);
            const isHi = i === hi;
            const tieneDato =
              i <= lastIdx &&
              (p.montoCobrados > 0 || p.montoPipeline > 0);
            return (
              <g key={p.mes}>
                <text
                  x={x}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isHi ? 'var(--accent-ink)' : 'var(--text-soft)'}
                  fontWeight={isHi ? 800 : 500}
                >
                  {p.label}
                </text>
                {tieneDato ? (
                  <>
                    <circle cx={x} cy={yP} r={isHi ? 5 : 3.5} fill="var(--accent)" />
                    <circle cx={x} cy={yC} r={isHi ? 4.5 : 3} fill="rgb(34, 197, 94)" />
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {hi >= 0 && points[hi] ? (
        <div className="cobros-evolucion-chart__tip">
          <span className="tabular">{formatCurrency(points[hi].montoCobrados)}</span> cobrado ·{' '}
          <span className="tabular">{formatCurrency(points[hi].montoPipeline)}</span> total
        </div>
      ) : (
        <div className="cobros-evolucion-chart__tip cobros-evolucion-chart__tip--muted">
          {lastIdx < 0
            ? 'Aún no hay cobros en el período.'
            : 'La línea llega hasta el último mes con cobro registrado.'}
        </div>
      )}
    </div>
  );
}
