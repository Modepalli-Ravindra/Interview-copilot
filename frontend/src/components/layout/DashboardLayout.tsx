import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Mic, Code2, Brain, History,
  Settings, LogOut, Target, Users, GitBranch,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'hsl(220 15% 5%)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* ── Sidebar ────────────────────────────────────── */}
      <aside style={{
        width: 240, flexShrink: 0,
        background: 'hsl(215 15% 8%)',
        borderRight: '1px solid hsl(215 15% 14%)',
        display: 'flex', flexDirection: 'column',
        padding: '24px 0',
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 20px 24px',
          borderBottom: '1px solid hsl(215 15% 14%)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 70%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mic size={16} color="hsl(220 15% 5%)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'hsl(210 10% 90%)', letterSpacing: '-0.01em' }}>
              InterviewPilot
            </div>
            <div style={{ fontSize: 11, color: 'hsl(174 85% 65%)', fontWeight: 600 }}>AI Platform</div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ icon: Icon, label, path, end }) => (
            <NavLink
              key={label}
              to={path}
              end={end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                textDecoration: 'none', width: '100%',
                fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.18s',
                background: isActive ? 'hsl(176 40% 45% / 0.15)' : 'transparent',
                color: isActive ? 'hsl(174 85% 70%)' : 'hsl(210 10% 55%)',
                fontFamily: 'var(--font-sans)',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} />
                  {label}
                  {isActive && (
                    <div style={{
                      marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
                      background: 'hsl(174 85% 70%)',
                    }} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User card */}
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
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 88%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'User'}
              </div>
              <div style={{ fontSize: 11, color: 'hsl(210 10% 50%)' }}>{user?.email || 'Candidate'}</div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/auth');
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
              title="Sign out"
            >
              <LogOut size={15} color="hsl(210 10% 45%)" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────── */}
      <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
