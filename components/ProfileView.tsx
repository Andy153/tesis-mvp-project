'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { Icon } from './Icon';
import { PinManagementCard } from './profile/PinManagementCard';
import { InvitacionSecretariaCard } from './profile/InvitacionSecretariaCard';
import type { ThemeMode, UserProfile } from '@/lib/profile';
import {
  applyThemeMode,
  DEFAULT_PROFILE,
  fileToAvatarDataUrl,
  getInitials,
  loadProfile,
  saveProfile,
} from '@/lib/profile';
import { useUserRole } from '@/lib/use-user-role';
import { LABELS_ROL } from '@/lib/roles';
import { ESPECIALIDADES_MEDICO, especialidadEnLista } from '@/lib/especialidades';

function clerkPreferredDisplayName(user: ReturnType<typeof useUser>['user']): string {
  if (!user) return '';
  const fn = user.firstName?.trim() ?? '';
  const ln = user.lastName?.trim() ?? '';
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  const full = user.fullName?.trim();
  if (full) return full;
  const email = user.primaryEmailAddress?.emailAddress;
  if (email) {
    const local = email.split('@')[0];
    return local ? local.replace(/[._]/g, ' ').trim() : '';
  }
  return '';
}

function sanitizeObra(v: string) {
  return (v || '').trim().replace(/\s+/g, ' ');
}

export function ProfileView() {
  const { signOut } = useClerk();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { rol } = useUserRole();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);
  const [hasDbProfile, setHasDbProfile] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [medicoOtrosAbierto, setMedicoOtrosAbierto] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const local = loadProfile();
    setProfile(local);
    applyThemeMode(local.theme);
    setHydrated(true);

    fetch('/api/profile')
      .then((r) => r.json())
      .then(({ profile: dbProfile }) => {
        setHasDbProfile(Boolean(dbProfile));
        if (dbProfile) {
          setProfile((p) => ({
            ...p,
            displayName: dbProfile.nombre ?? p.displayName,
            profesion: dbProfile.especialidad ?? p.profesion,
            obras:
              Array.isArray(dbProfile.prepagas) && dbProfile.prepagas.length > 0
                ? dbProfile.prepagas.map((name: string) => ({ obraSocial: name, codigo: '' }))
                : p.obras,
          }));
        }
      })
      .catch(() => {
        setHasDbProfile(false);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (hasDbProfile !== false || !clerkLoaded || !clerkUser) return;
    setProfile((p) => {
      const name = clerkPreferredDisplayName(clerkUser);
      const nextName = p.displayName.trim() ? p.displayName : name;
      const prof = rol === 'secretaria' ? LABELS_ROL.secretaria : p.profesion;
      return { ...p, displayName: nextName, profesion: prof, updatedAt: new Date().toISOString() };
    });
  }, [hasDbProfile, clerkLoaded, clerkUser, rol]);

  useEffect(() => {
    if (rol !== 'secretaria') return;
    setProfile((p) =>
      p.profesion === LABELS_ROL.secretaria
        ? p
        : { ...p, profesion: LABELS_ROL.secretaria, updatedAt: new Date().toISOString() },
    );
  }, [rol]);

  useEffect(() => {
    if (rol !== 'medico') {
      setMedicoOtrosAbierto(false);
      return;
    }
    const p = profile.profesion.trim();
    if (!p) return;
    setMedicoOtrosAbierto(!especialidadEnLista(p));
  }, [rol, profile.profesion]);

  useEffect(() => {
    if (!hydrated) return;
    applyThemeMode(profile.theme);
    saveProfile(profile);
    // Solo reaccionar a tema y avatar; el resto del perfil no debe disparar persistencia local en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [profile.theme, profile.avatarDataUrl, hydrated]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    const especialidadFinal =
      rol === 'secretaria' ? LABELS_ROL.secretaria : profile.profesion.trim();
    if (rol === 'medico' && !especialidadFinal) {
      setSaveError('Elegí o escribí tu especialidad.');
      setSaving(false);
      return;
    }
    if (!profile.displayName.trim()) {
      setSaveError('Completá el nombre que querés mostrar.');
      setSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: profile.displayName.trim(),
          especialidad: especialidadFinal,
          prepagas: profile.obras.map((o) => o.obraSocial).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setHasDbProfile(true);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
      saveProfile({
        ...profile,
        displayName: profile.displayName.trim(),
        profesion: especialidadFinal,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setSaveError('No se pudo guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const obraErrors = useMemo(() => {
    const errs: string[] = [];
    profile.obras.forEach((o, i) => {
      if (!o.obraSocial.trim()) errs.push(`Fila ${i + 1}: falta obra social`);
      if (!o.codigo.trim()) errs.push(`Fila ${i + 1}: falta código`);
    });
    return errs;
  }, [profile.obras]);

  const especialidadSelectValue = useMemo(() => {
    if (medicoOtrosAbierto) return 'Otros';
    const p = profile.profesion.trim();
    if (!p) return '';
    if (especialidadEnLista(p)) return p;
    return 'Otros';
  }, [profile.profesion, medicoOtrosAbierto]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Tu perfil</h1>
          <p className="page-subtitle">Cómo te mostramos en la app y tus preferencias.</p>
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="avatar avatar--lg avatar--profile-header" style={{ overflow: 'hidden' }}>
              {profile.avatarDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarDataUrl} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontWeight: 700 }}>{getInitials(profile.displayName || 'U')}</span>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{profile.displayName || '—'}</div>
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
              <Icon name="upload" size={18} /> {avatarBusy ? 'Cargando…' : 'Cambiar la foto'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!clerkUser}
              onClick={() => {
                const name = clerkPreferredDisplayName(clerkUser);
                setProfile((p) => ({
                  ...p,
                  displayName: name || p.displayName,
                  profesion: rol === 'secretaria' ? LABELS_ROL.secretaria : p.profesion,
                  updatedAt: new Date().toISOString(),
                }));
              }}
            >
              Usar nombre de mi cuenta
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? 'Guardando…' : saveOk ? '✓ Guardado' : 'Guardar cambios'}
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
          <div style={{ fontWeight: 800, marginBottom: 10, fontSize: '1.05rem' }}>Datos profesionales</div>
          <div className="form-grid">
            <label className="field">
              <div className="field-label">Nombre que querés que aparezca</div>
              <input
                className="docs-search"
                value={profile.displayName}
                onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value, updatedAt: new Date().toISOString() }))}
                placeholder="Ej: Dra. María Ferreira"
              />
            </label>
            <label className="field">
              <div className="field-label">Profesión / especialidad</div>
              {rol === 'secretaria' ? (
                <>
                  <input
                    className="docs-search"
                    value={LABELS_ROL.secretaria}
                    readOnly
                    disabled
                    style={{ opacity: 0.85, cursor: 'not-allowed' }}
                  />
                  <div className="field-hint">Tu cuenta está registrada como secretaría; este dato no se puede cambiar acá.</div>
                </>
              ) : rol === 'medico' ? (
                <>
                  <select
                    className="docs-search select-theme"
                    value={especialidadSelectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'Otros') {
                        setMedicoOtrosAbierto(true);
                        setProfile((p) => ({
                          ...p,
                          profesion: '',
                          updatedAt: new Date().toISOString(),
                        }));
                        return;
                      }
                      setMedicoOtrosAbierto(false);
                      setProfile((p) => ({
                        ...p,
                        profesion: v,
                        updatedAt: new Date().toISOString(),
                      }));
                    }}
                  >
                    <option value="">Elegí una especialidad…</option>
                    {ESPECIALIDADES_MEDICO.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                  {especialidadSelectValue === 'Otros' && (
                    <input
                      className="docs-search"
                      style={{ marginTop: 8 }}
                      value={profile.profesion}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          profesion: e.target.value,
                          updatedAt: new Date().toISOString(),
                        }))
                      }
                      placeholder="Escribí tu especialidad"
                    />
                  )}
                </>
              ) : (
                <>
                  <input
                    className="docs-search"
                    value={profile.profesion}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, profesion: e.target.value, updatedAt: new Date().toISOString() }))
                    }
                    placeholder="Ej: Tocoginecología"
                  />
                  <div className="field-hint">Cuando se asigne tu rol en la cuenta, vas a ver opciones acordes.</div>
                </>
              )}
            </label>
          </div>
          {saveError && (
            <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{saveError}</div>
          )}
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Preferencias</div>
          <label className="field">
            <div className="field-label">Tema</div>
            <select
              className="docs-search select-theme"
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
                className="btn btn-secondary"
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
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(JSON.stringify(profile));
                }}
              >
                Copiar JSON
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => signOut({ redirectUrl: '/sign-in' })}
              >
                <Icon name="x" size={18} /> Cerrar sesión
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

      <PinManagementCard />
      <InvitacionSecretariaCard />
    </div>
  );
}

