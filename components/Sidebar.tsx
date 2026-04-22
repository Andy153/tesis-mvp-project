'use client';

import { Icon, type IconName } from './Icon';

type TabId = 'upload' | 'documents' | 'calendar' | 'errors' | 'dashboard' | 'alerts' | 'projection' | 'settings';

interface SidebarProps {
  active: string;
  setActive: (id: string) => void;
  errorCount: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  user?: { displayName: string; profesion: string; avatarDataUrl?: string };
}

interface Item {
  id: TabId;
  label: string;
  icon: IconName;
  section: 'work' | 'soon';
  disabled?: boolean;
  badge?: number;
}

export function Sidebar({ active, setActive, errorCount, mobileOpen, onCloseMobile, user }: SidebarProps) {
  const items: Item[] = [
    { id: 'upload', label: 'Cargar documentos', icon: 'upload', section: 'work' },
    { id: 'documents', label: 'Documentos', icon: 'file', section: 'work' },
    { id: 'calendar', label: 'Calendario', icon: 'calendar', section: 'work' },
    { id: 'errors', label: 'Errores detectados', icon: 'alert', section: 'work', badge: errorCount },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', section: 'soon', disabled: true },
    { id: 'alerts', label: 'Alertas', icon: 'bell', section: 'soon', disabled: true },
    { id: 'projection', label: 'Proyección de cobro', icon: 'chart', section: 'soon', disabled: true },
  ];

  return (
    <aside
      id="main-sidebar"
      className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`}
    >
      <button
        type="button"
        className="sidebar-close"
        aria-label="Cerrar menú"
        onClick={() => onCloseMobile?.()}
      >
        <Icon name="x" size={20} />
      </button>
      <div className="brand">
        <span className="brand-mark">Trazá</span>
      </div>
      <div className="nav-section">MVP — activo</div>
      {items
        .filter((i) => i.section === 'work')
        .map((item) => (
          <div
            key={item.id}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => setActive(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActive(item.id);
              }
            }}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
          </div>
        ))}
      <div className="nav-section">Próximas features</div>
      {items
        .filter((i) => i.section === 'soon')
        .map((item) => (
          <div key={item.id} className="nav-item disabled">
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </div>
        ))}
      <div
        className="sidebar-footer sidebar-footer--clickable"
        role="button"
        tabIndex={0}
        onClick={() => setActive('settings')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActive('settings');
          }
        }}
        title="Abrir perfil"
      >
        <div className="avatar" style={{ overflow: 'hidden' }}>
          {user?.avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (user?.displayName || 'MF')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase()
          )}
        </div>
        <div>
          <div className="user-name">{user?.displayName || 'Dra. M. Ferreira'}</div>
          <div className="user-role">{user?.profesion || 'Tocoginecología'}</div>
        </div>
      </div>
    </aside>
  );
}
