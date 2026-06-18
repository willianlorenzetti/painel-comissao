'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  User,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Key,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/vendedor', icon: User, label: 'Vendedor' },
  { href: '/gestor', icon: Users, label: 'Gestor' },
  { href: '/configuracao', icon: Settings, label: 'Configuração' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col transition-all duration-300 shrink-0"
      style={{
        width: collapsed ? 64 : 220,
        background: '#0a1628',
        borderRight: '1px solid #1a3a6e',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5"
        style={{ borderBottom: '1px solid #1a3a6e' }}
      >
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 36, height: 36, background: '#FFD700' }}
        >
          <Key size={20} color="#00205C" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-white text-sm leading-tight">DOVALE</p>
            <p className="text-xs" style={{ color: '#FFD700' }}>
              Comissões
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
              style={{
                background: active ? '#FFD700' : 'transparent',
                color: active ? '#00205C' : '#94a3b8',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = '#1a3a6e';
                  (e.currentTarget as HTMLElement).style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                }
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center py-3 w-full transition-colors"
        style={{
          borderTop: '1px solid #1a3a6e',
          color: '#64748b',
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.color = '#FFD700')
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.color = '#64748b')
        }
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
