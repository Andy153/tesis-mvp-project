'use client';

import { Logo } from './Logo';
import { getInitials } from '@/lib/profile';
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
    { id: 'dashboard', label: 'Resumen general', icon: 'dashboard', section: 'work' },
    { id: 'upload', label: 'Agregar documentos', icon: 'upload', section: 'work' },
    { id: 'documents', label: 'Mis documentos', icon: 'file', section: 'work' },
    { id: 'calendar', label: 'Vista por fechas', icon: 'calendar', section: 'work' },
    { id: 'errors', label: 'Qué conviene revisar', icon: 'alert', section: 'work', badge: errorCount },
    { id: 'alerts', label: 'Avisos', icon: 'bell', section: 'soon', disabled: true },
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
        <Logo size={40} variant="dark" />
        <span className="brand__wordmark">Trazá</span>
      </div>
      <div className="nav-section">Menú principal</div>
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
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
            {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
          </div>
        ))}
      <div className="nav-section">Próximamente</div>
      {items
        .filter((i) => i.section === 'soon')
        .map((item) => (
          <div key={item.id} className="nav-item disabled">
            <Icon name={item.icon} size={20} />
            <span className="nav-item__label">{item.label}</span>
            <span className="nav-item__soon">Próximo</span>
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
        title="Podés tocar aquí para abrir tu perfil y preferencias"
      >
        <div className="avatar" style={{ overflow: 'hidden' }}>
          {user?.avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            getInitials(user?.displayName || 'Dra. M. Ferreira')
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
