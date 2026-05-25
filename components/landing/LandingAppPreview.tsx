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

export function LandingAppPreview({ className }: { className?: string }) {
  const [tab, setTab] = useState<TabId>('upload');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const panelsWrapRef = useRef<HTMLDivElement>(null);
  const [panelMinHeight, setPanelMinHeight] = useState(220);

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
        return TABS[(i + 1) % TABS.length].id;
      });
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    measurePanels();
  }, [measurePanels, uploadProgress]);

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

      <div className={styles.appPreviewTabs} role="tablist">
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
              onClick={() => setTab(t.id)}
            >
              <Icon size={14} aria-hidden />
              {t.label}
            </button>
          );
        })}
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
              <div className={styles.previewBars} aria-hidden>
                {[
                  { label: 'Sem 1', h: 45 },
                  { label: 'Sem 2', h: 62 },
                  { label: 'Sem 3', h: 38 },
                  { label: 'Sem 4', h: 88 },
                ].map((b) => (
                  <div key={b.label} className={styles.previewBarCol}>
                    <div className={styles.previewBarTrack}>
                      <div className={styles.previewBarFill} style={{ height: `${b.h}%` }} />
                    </div>
                    <span>{b.label}</span>
                  </div>
                ))}
              </div>
              <p className={styles.previewHint}>Cobros estimados por semana · datos de ejemplo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
