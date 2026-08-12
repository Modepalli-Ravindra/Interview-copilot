import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Mic, Code2, Brain, History,
  Settings, LogOut, Target, Users, GitBranch, Menu, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../lib/useMediaQuery';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',    path: '/dashboard',             end: true },
  { icon: Mic,             label: 'Interviews',   path: '/dashboard/interviews',  end: false },
  { icon: Target,          label: 'Resume vs JD', path: '/dashboard/match',       end: false },
  { icon: GitBranch,       label: 'GitHub',       path: '/dashboard/github',      end: false },
  { icon: Code2,           label: 'Coding',       path: '/dashboard/coding',      end: false },
  { icon: Users,           label: 'Candidates',   path: '/dashboard/candidates',  end: false },
  { icon: Brain,           label: 'AI Roadmap',   path: '/dashboard/roadmap',     end: false },
  { icon: History,         label: 'History',      path: '/dashboard/history',     end: false },
  { icon: Settings,        label: 'Settings',     path: '/dashboard/settings',    end: false },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  const handleNav = () => setMenuOpen(false);

  const logo = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 20px 24px',
      borderBottom: '1px solid hsl(215 15% 14%)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 70%))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Mic size={16} color="hsl(220 15% 5%)" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'hsl(210 10% 90%)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          InterviewPilot
        </div>
        <div style={{ fontSize: 11, color: 'hsl(174 85% 65%)', fontWeight: 600 }}>AI Platform</div>
      </div>
    </div>
  );

  const nav = (
    <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
      {navItems.map(({ icon: Icon, label, path, end }) => (
        <NavLink
          key={label}
          to={path}
          end={end}
          onClick={handleNav}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px', borderRadius: 10,
            textDecoration: 'none', width: '100%',
            fontSize: 14, fontWeight: isActive ? 600 : 400,
            transition: 'all 0.18s',
            background: isActive ? 'hsl(176 40% 45% / 0.15)' : 'transparent',
            color: isActive ? 'hsl(174 85% 70%)' : 'hsl(210 10% 55%)',
            fontFamily: 'var(--font-sans)',
            minHeight: 44,
          })}
        >
          {({ isActive }) => (
            <>
              <Icon size={17} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              {isActive && (
                <div style={{
                  marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
                  background: 'hsl(174 85% 70%)', flexShrink: 0,
                }} />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const userCard = (
    <div style={{
      margin: '0 12px 0',
      padding: '12px',
      borderRadius: 12,
      background: 'hsl(215 15% 11%)',
      border: '1px solid hsl(215 15% 16%)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, hsl(176 40% 40%), hsl(215 80% 50%))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0,
        }}>
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 88%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 11, color: 'hsl(210 10% 50%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || 'Candidate'}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 32, minHeight: 32, borderRadius: 8, flexShrink: 0,
          }}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={15} color="hsl(210 10% 45%)" />
        </button>
      </div>
    </div>
  );

  /* ── Desktop: fixed sidebar + main ─────────────────── */
  if (!isMobile) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        background: 'hsl(220 15% 5%)',
        fontFamily: 'var(--font-sans)',
      }}>
        <aside style={{
          width: 240, flexShrink: 0,
          background: 'hsl(215 15% 8%)',
          borderRight: '1px solid hsl(215 15% 14%)',
          display: 'flex', flexDirection: 'column',
          padding: '24px 0',
          position: 'sticky', top: 0, height: '100vh',
        }}>
          {logo}
          {nav}
          {userCard}
        </aside>

        <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    );
  }

  /* ── Mobile: top bar + slide-in drawer ─────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'hsl(220 15% 5%)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        background: 'hsl(215 15% 8% / 0.92)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        borderBottom: '1px solid hsl(215 15% 14%)',
      }}>
        <button
          onClick={() => setMenuOpen(true)}
          style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'hsl(215 15% 12%)', border: '1px solid hsl(215 15% 16%)',
            cursor: 'pointer', color: 'hsl(210 10% 85%)',
          }}
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 70%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mic size={15} color="hsl(220 15% 5%)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'hsl(210 10% 90%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              InterviewPilot
            </div>
            <div style={{ fontSize: 11, color: 'hsl(174 85% 65%)', fontWeight: 600 }}>AI Platform</div>
          </div>
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, hsl(176 40% 40%), hsl(215 80% 50%))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'white',
        }}>
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: '16px 16px', minWidth: 0 }}>
        <Outlet />
      </main>

      {/* Overlay */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Drawer */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 280, maxWidth: '85vw',
        zIndex: 60,
        background: 'hsl(215 15% 8%)',
        borderRight: '1px solid hsl(215 15% 14%)',
        display: 'flex', flexDirection: 'column',
        padding: '20px 0',
        transform: menuOpen ? 'translateX(0)' : 'translateX(-105%)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {logo}
          <button
            onClick={() => setMenuOpen(false)}
            style={{
              width: 44, height: 44, borderRadius: 10, marginRight: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'hsl(215 15% 12%)', border: '1px solid hsl(215 15% 16%)',
              cursor: 'pointer', color: 'hsl(210 10% 85%)',
            }}
            title="Close menu"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        {nav}
        {userCard}
      </aside>
    </div>
  );
}
