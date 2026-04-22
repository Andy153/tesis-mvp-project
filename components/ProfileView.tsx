'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { ThemeMode, UserProfile } from '@/lib/profile';
import { applyThemeMode, DEFAULT_PROFILE, fileToAvatarDataUrl, loadProfile, saveProfile } from '@/lib/profile';

function sanitizeObra(v: string) {
  return (v || '').trim().replace(/\s+/g, ' ');
}

export function ProfileView() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    applyThemeMode(p.theme);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyThemeMode(profile.theme);
    saveProfile(profile);
  }, [profile, hydrated]);

  const obraErrors = useMemo(() => {
    const errs: string[] = [];
    profile.obras.forEach((o, i) => {
      if (!o.obraSocial.trim()) errs.push(`Fila ${i + 1}: falta obra social`);
      if (!o.codigo.trim()) errs.push(`Fila ${i + 1}: falta código`);
    });
    return errs;
  }, [profile.obras]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Perfil</h1>
          <p className="page-subtitle">Configurá tu usuario y preferencias de trabajo.</p>
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="avatar avatar--lg" style={{ overflow: 'hidden' }}>
              {profile.avatarDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarDataUrl} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontWeight: 800 }}>{(profile.displayName || 'U').slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{profile.displayName || '—'}</div>
              <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{profile.profesion || '—'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                Actualizado: {new Date(profile.updatedAt).toLocaleString('es-AR')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" size={14} /> {avatarBusy ? 'Cargando…' : 'Cambiar foto'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setProfile({ ...DEFAULT_PROFILE, updatedAt: new Date().toISOString() });
              }}
            >
              Resetear perfil
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setAvatarBusy(true);
            try {
              const url = await fileToAvatarDataUrl(f, { maxSize: 256, quality: 0.86 });
              setProfile((p) => ({ ...p, avatarDataUrl: url, updatedAt: new Date().toISOString() }));
            } finally {
              setAvatarBusy(false);
              e.target.value = '';
            }
          }}
        />
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Datos profesionales</div>
          <div className="form-grid">
            <label className="field">
              <div className="field-label">Nombre para mostrar</div>
              <input
                className="docs-search"
                value={profile.displayName}
                onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value, updatedAt: new Date().toISOString() }))}
                placeholder="Ej: Dra. María Ferreira"
              />
            </label>
            <label className="field">
              <div className="field-label">Profesión / especialidad</div>
              <input
                className="docs-search"
                value={profile.profesion}
                onChange={(e) => setProfile((p) => ({ ...p, profesion: e.target.value, updatedAt: new Date().toISOString() }))}
                placeholder="Ej: Tocoginecología"
              />
            </label>
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Preferencias</div>
          <label className="field">
            <div className="field-label">Tema</div>
            <select
              className="docs-search"
              value={profile.theme}
              onChange={(e) => setProfile((p) => ({ ...p, theme: e.target.value as ThemeMode, updatedAt: new Date().toISOString() }))}
            >
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
            <div className="field-hint">El modo oscuro aplica a toda la app.</div>
          </label>

          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Utilidades</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'traza_perfil.json';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 20_000);
                }}
              >
                Exportar perfil
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(JSON.stringify(profile));
                }}
              >
                Copiar JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800 }}>Obras sociales y códigos</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Guardá tu código por obra social para que la app lo sugiera o lo use al exportar.
            </div>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setProfile((p) => ({
                ...p,
                obras: [...p.obras, { obraSocial: '', codigo: '' }],
                updatedAt: new Date().toISOString(),
              }))
            }
          >
            + Agregar
          </button>
        </div>

        {obraErrors.length > 0 && (
          <div style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--warn-soft)', border: '1px solid rgba(184, 116, 10, 0.25)', borderRadius: 8, color: 'var(--warn)', fontSize: 12 }}>
            {obraErrors[0]}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 60px', gap: 10, alignItems: 'center' }}>
          <div style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 12 }}>Obra social</div>
          <div style={{ color: 'var(--text-soft)', fontWeight: 700, fontSize: 12 }}>Código</div>
          <div />

          {profile.obras.map((o, idx) => (
            <div key={idx} style={{ display: 'contents' }}>
              <input
                className="docs-search"
                value={o.obraSocial}
                placeholder="Ej: Swiss Medical"
                onChange={(e) => {
                  // No sanitizar en cada tecla: permite espacios (incl. al final) mientras escribe.
                  const v = e.target.value;
                  setProfile((p) => ({
                    ...p,
                    obras: p.obras.map((x, i) => (i === idx ? { ...x, obraSocial: v } : x)),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onBlur={() => {
                  const v = sanitizeObra(o.obraSocial);
                  if (v === o.obraSocial) return;
                  setProfile((p) => ({
                    ...p,
                    obras: p.obras.map((x, i) => (i === idx ? { ...x, obraSocial: v } : x)),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
              />
              <input
                className="docs-search"
                value={o.codigo}
                placeholder="Ej: 08.01.02"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setProfile((p) => ({
                    ...p,
                    obras: p.obras.map((x, i) => (i === idx ? { ...x, codigo: v } : x)),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
              />
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    obras: p.obras.filter((_, i) => i !== idx),
                    updatedAt: new Date().toISOString(),
                  }))
                }
                aria-label="Eliminar"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>

        {profile.obras.length === 0 && (
          <div style={{ padding: 14, color: 'var(--text-soft)', fontSize: 12 }}>Todavía no agregaste obras sociales.</div>
        )}
      </div>
    </div>
  );
}

