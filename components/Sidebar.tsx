'use client';

import { Icon, type IconName } from './Icon';

type TabId = 'upload' | 'errors' | 'dashboard' | 'alerts' | 'projection' | 'settings';

interface SidebarProps {
  active: string;
  setActive: (id: string) => void;
  errorCount: number;
}

interface Item {
  id: TabId;
  label: string;
  icon: IconName;
  section: 'work' | 'soon';
  disabled?: boolean;
  badge?: number;
}

export function Sidebar({ active, setActive, errorCount }: SidebarProps) {
  const items: Item[] = [
    { id: 'upload', label: 'Cargar documentos', icon: 'upload', section: 'work' },
    { id: 'errors', label: 'Errores detectados', icon: 'alert', section: 'work', badge: errorCount },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', section: 'soon', disabled: true },
    { id: 'alerts', label: 'Alertas', icon: 'bell', section: 'soon', disabled: true },
    { id: 'projection', label: 'Proyección de cobro', icon: 'chart', section: 'soon', disabled: true },
    { id: 'settings', label: 'Configuración', icon: 'settings', section: 'soon', disabled: true },
  ];

  return (
    <aside className="sidebar">
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
      <div className="sidebar-footer">
        <div className="avatar">MF</div>
        <div>
          <div className="user-name">Dra. M. Ferreira</div>
          <div className="user-role">Tocoginecología</div>
        </div>
      </div>
    </aside>
  );
}
