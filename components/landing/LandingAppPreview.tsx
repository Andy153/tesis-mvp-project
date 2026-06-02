'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  Upload,
} from 'lucide-react';
import styles from './landing.module.css';

const TABS = [
  { id: 'upload', label: 'Subir', icon: Upload },
  { id: 'validate', label: 'Validar', icon: FileText },
  { id: 'dashboard', label: 'Cobrar', icon: LayoutDashboard },
] as const;

type TabId = (typeof TABS)[number]['id'];

const AUTO_MS = 4500;

const PREVIEW_CALENDAR_WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const PREVIEW_CALENDAR_PAYMENTS: Record<number, string> = {
  3: '$12.400',
  8: '$28.200',
  12: '$31.000',
  15: '$48.500',
  19: '$22.800',
  22: '$15.600',
  27: '$9.200',
};

const PREVIEW_CALENDAR_CREDITED = new Set(
  Object.keys(PREVIEW_CALENDAR_PAYMENTS).map((d) => Number(d)),
);

/** Mayo 2026 — empieza viernes (4 celdas vacías con semana Lun–Dom). */
const PREVIEW_CALENDAR_CELLS: { day: number | null; credited?: boolean }[] = [
  ...Array.from({ length: 4 }, () => ({ day: null as number | null })),
  ...Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    return {
      day,
      credited: PREVIEW_CALENDAR_CREDITED.has(day),
    };
  }),
  ...Array.from({ length: 35 - 4 - 31 }, () => ({ day: null as number | null })),
];

export function LandingAppPreview({ className }: { className?: string }) {
  const [tab, setTab] = useState<TabId>('upload');
  const [slideDirection, setSlideDirection] = useState(1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const panelsWrapRef = useRef<HTMLDivElement>(null);
  const [panelMinHeight, setPanelMinHeight] = useState(220);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(15);

  const measurePanels = useCallback(() => {
    const wrap = panelsWrapRef.current;
    if (!wrap) return;
    const panels = wrap.querySelectorAll<HTMLElement>('[data-preview-panel]');
    let max = 0;
    panels.forEach((el) => {
      max = Math.max(max, el.offsetHeight);
    });
    if (max > 0) setPanelMinHeight(Math.ceil(max));
  }, []);

  const tabIndex = TABS.findIndex((t) => t.id === tab);

  const goToTab = useCallback((next: TabId) => {
    const prevIdx = TABS.findIndex((t) => t.id === tab);
    const nextIdx = TABS.findIndex((t) => t.id === next);
    setSlideDirection(nextIdx >= prevIdx ? 1 : -1);
    setTab(next);
  }, [tab]);

  const panelAnimClass =
    slideDirection > 0 ? styles.appPreviewPanelInForward : styles.appPreviewPanelInBack;

  useEffect(() => {
    if (tab !== 'upload') return;
    setUploadProgress(0);
    const t0 = window.setTimeout(() => setUploadProgress(72), 400);
    const t1 = window.setTimeout(() => setUploadProgress(100), 1200);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [tab]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setTab((prev) => {
        const i = TABS.findIndex((t) => t.id === prev);
        setSlideDirection(1);
        return TABS[(i + 1) % TABS.length].id;
      });
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    measurePanels();
  }, [measurePanels, uploadProgress, selectedCalendarDay]);

  useEffect(() => {
    const wrap = panelsWrapRef.current;
    if (!wrap) return;

    const ro = new ResizeObserver(() => measurePanels());
    wrap.querySelectorAll('[data-preview-panel]').forEach((el) => ro.observe(el));
    window.addEventListener('resize', measurePanels);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measurePanels);
    };
  }, [measurePanels]);

  return (
    <div
      className={[styles.appPreview, className].filter(Boolean).join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Vista previa de la aplicación"
    >
      <div className={styles.appPreviewChrome}>
        <span className={styles.appPreviewDot} />
        <span className={styles.appPreviewDot} />
        <span className={styles.appPreviewDot} />
        <span className={styles.appPreviewUrl}>app.traza · liquidaciones</span>
      </div>

      <div
        className={styles.appPreviewTabs}
        role="tablist"
        style={{ '--preview-tab-index': tabIndex } as React.CSSProperties}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={[styles.appPreviewTab, active ? styles.appPreviewTabActive : ''].join(' ')}
              onClick={() => goToTab(t.id)}
            >
              <Icon size={14} aria-hidden />
              {t.label}
            </button>
          );
        })}
        <span className={styles.appPreviewTabIndicator} aria-hidden />
      </div>

      <div className={styles.appPreviewBody}>
        <div
          ref={panelsWrapRef}
          className={styles.appPreviewPanels}
          style={{ minHeight: panelMinHeight }}
        >
          <div
            data-preview-panel
            role="tabpanel"
            aria-hidden={tab !== 'upload'}
            className={[
              styles.appPreviewPanel,
              styles.appPreviewPanelCentered,
              tab === 'upload' ? styles.appPreviewPanelActive : '',
              tab === 'upload' ? panelAnimClass : '',
            ].join(' ')}
          >
            <div className={styles.previewUpload}>
              <div className={styles.previewDropzone}>
                <Upload size={28} strokeWidth={1.5} aria-hidden />
                <p>Parte quirúrgico + autorización</p>
                <span className={styles.previewFileName}>parte_histeroscopia_mayo.pdf</span>
              </div>
              <div className={styles.previewProgressTrack}>
                <div
                  className={styles.previewProgressFill}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className={styles.previewHint}>
                {uploadProgress >= 100 ? 'Listo para extraer datos' : 'Subiendo documento…'}
              </p>
            </div>
          </div>

          <div
            data-preview-panel
            role="tabpanel"
            aria-hidden={tab !== 'validate'}
            className={[
              styles.appPreviewPanel,
              tab === 'validate' ? styles.appPreviewPanelActive : '',
              tab === 'validate' ? panelAnimClass : '',
            ].join(' ')}
          >
            <div className={styles.previewValidate}>
              <div className={styles.previewFieldRow}>
                <span>Paciente</span>
                <strong>María G. · DNI 24.***.***</strong>
                <CheckCircle2 size={16} className={styles.previewOk} aria-hidden />
              </div>
              <div className={styles.previewFieldRow}>
                <span>Código nomenclador</span>
                <strong>11010202 · Swiss Medical</strong>
                <CheckCircle2 size={16} className={styles.previewOk} aria-hidden />
              </div>
              <div className={styles.previewFieldRow}>
                <span>Autorización</span>
                <strong>Vigente · OSDE 310</strong>
                <CheckCircle2 size={16} className={styles.previewOk} aria-hidden />
              </div>
              <div className={[styles.previewFieldRow, styles.previewFieldWarn].join(' ')}>
                <span>Plazo de presentación</span>
                <strong>12 días restantes</strong>
                <AlertCircle size={16} className={styles.previewWarn} aria-hidden />
              </div>
              <span className={styles.previewBadgeOk}>3 validaciones OK · 1 alerta</span>
            </div>
          </div>

          <div
            data-preview-panel
            role="tabpanel"
            aria-hidden={tab !== 'dashboard'}
            className={[
              styles.appPreviewPanel,
              styles.appPreviewPanelCentered,
              tab === 'dashboard' ? styles.appPreviewPanelActive : '',
              tab === 'dashboard' ? panelAnimClass : '',
            ].join(' ')}
          >
            <div className={styles.previewDashboard}>
              <div className={styles.previewKpis}>
                <div className={styles.previewKpi}>
                  <span>Proyección mayo</span>
                  <strong>USD 4.280</strong>
                </div>
                <div className={styles.previewKpi}>
                  <span>Pendiente Swiss</span>
                  <strong>2 partes</strong>
                </div>
              </div>
              <div className={styles.previewCalendar}>
                <div className={styles.previewCalendarHead}>
                  <span className={styles.previewCalendarMonth}>Mayo 2026</span>
                  <span className={styles.previewCalendarLegend}>
                    <span className={styles.previewCalendarLegendDot} />
                    Tocá un día acreditado
                  </span>
                </div>
                <div className={styles.previewCalendarWeekdays}>
                  {PREVIEW_CALENDAR_WEEKDAYS.map((d) => (
                    <span key={d} className={styles.previewCalendarWeekday}>
                      {d}
                    </span>
                  ))}
                </div>
                <div className={styles.previewCalendarGrid} role="grid" aria-label="Mayo 2026">
                  {PREVIEW_CALENDAR_CELLS.map((cell, i) => {
                    if (cell.day == null) {
                      return (
                        <div
                          key={i}
                          role="presentation"
                          className={[styles.previewCalendarDay, styles.previewCalendarDayEmpty].join(
                            ' ',
                          )}
                        />
                      );
                    }

                    const isSelected = selectedCalendarDay === cell.day;
                    const amount = PREVIEW_CALENDAR_PAYMENTS[cell.day];
                    const chipBelow = cell.day <= 14;

                    if (cell.credited) {
                      return (
                        <button
                          key={i}
                          type="button"
                          role="gridcell"
                          aria-label={`Día ${cell.day}, cobro acreditado ${amount}`}
                          aria-pressed={isSelected}
                          className={[
                            styles.previewCalendarDay,
                            styles.previewCalendarDayCredited,
                            styles.previewCalendarDayBtn,
                            isSelected ? styles.previewCalendarDaySelected : '',
                          ].join(' ')}
                          onClick={() => setSelectedCalendarDay(cell.day!)}
                        >
                          <span className={styles.previewCalendarDayNum}>{cell.day}</span>
                          <span className={styles.previewCalendarDot} aria-hidden />
                          {isSelected && amount && (
                            <span
                              className={[
                                styles.previewCalendarChip,
                                chipBelow ? styles.previewCalendarChipBelow : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              Cobro acreditado · {amount}
                            </span>
                          )}
                        </button>
                      );
                    }

                    return (
                      <div key={i} role="gridcell" className={styles.previewCalendarDay}>
                        <span className={styles.previewCalendarDayNum}>{cell.day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className={styles.previewHint}>Acreditaciones del mes · datos de ejemplo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
