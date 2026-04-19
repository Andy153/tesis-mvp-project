"use client"

import { Upload, AlertTriangle, LayoutDashboard, Bell, BarChart3, Settings } from "lucide-react"

interface SidebarProps {
  active: "upload" | "errors"
  setActive: (view: "upload" | "errors") => void
  errorCount: number
}

const items = [
  { id: "upload" as const, label: "Cargar documentos", icon: Upload, section: "work" },
  { id: "errors" as const, label: "Errores detectados", icon: AlertTriangle, section: "work" },
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, section: "soon", disabled: true },
  { id: "alerts" as const, label: "Alertas", icon: Bell, section: "soon", disabled: true },
  { id: "projection" as const, label: "Proyeccion de cobro", icon: BarChart3, section: "soon", disabled: true },
  { id: "settings" as const, label: "Configuracion", icon: Settings, section: "soon", disabled: true },
]

export function Sidebar({ active, setActive, errorCount }: SidebarProps) {
  return (
    <aside className="bg-card border-r border-border p-6 flex flex-col gap-1 sticky top-0 h-screen">
      <div className="flex items-baseline gap-2 px-2 pb-6 mb-2 border-b border-border">
        <span className="font-serif text-[32px] font-normal text-primary tracking-tight leading-none">
          Traza
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground px-3 pt-4 pb-2 font-medium">
        MVP - activo
      </div>
      {items
        .filter((i) => i.section === "work")
        .map((item) => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 py-2 px-3 rounded-md cursor-pointer transition-all font-medium text-[13.5px] select-none relative ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              onClick={() => setActive(item.id)}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {item.id === "errors" && errorCount > 0 && (
                <span className="ml-auto bg-destructive text-destructive-foreground text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {errorCount}
                </span>
              )}
            </div>
          )
        })}

      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground px-3 pt-4 pb-2 font-medium">
        Proximas features
      </div>
      {items
        .filter((i) => i.section === "soon")
        .map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.id}
              className="flex items-center gap-2.5 py-2 px-3 rounded-md opacity-40 cursor-not-allowed font-medium text-[13.5px] text-muted-foreground relative"
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              <span className="absolute right-3 text-[9px] uppercase tracking-[0.08em] text-muted-foreground font-normal">
                Proximo
              </span>
            </div>
          )
        })}

      <div className="mt-auto pt-3 border-t border-border flex items-center gap-2.5 px-3">
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold text-xs">
          MF
        </div>
        <div>
          <div className="font-semibold text-[13px]">Dra. M. Ferreira</div>
          <div className="text-[11.5px] text-muted-foreground">Tocoginecologia</div>
        </div>
      </div>
    </aside>
  )
}
