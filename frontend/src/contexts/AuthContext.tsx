import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useInterviewStore } from '../stores/interviewStore';
import { apiFetch, clearAuthToken, setAuthToken } from '../lib/api';
import { socketService } from '../services/socketService';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean; // keep for back-compat
  isInitializing: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem('interviewpilot_token');
      if (!storedToken) {
        setIsInitializing(false);
        return;
      }

      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            setToken(storedToken);
            setUser(data.user);
            localStorage.setItem('interviewpilot_user', JSON.stringify(data.user));
          } else {
            // Invalid data shape
            clearAuthToken();
            localStorage.removeItem('interviewpilot_user');
          }
        } else {
          // Token expired or invalid, handled by apiFetch interceptor or here
          clearAuthToken();
          localStorage.removeItem('interviewpilot_user');
        }
      } catch (e) {
        console.error('Failed to verify token:', e);
        // On network error, we don't necessarily want to wipe credentials, but for safety:
        clearAuthToken();
        localStorage.removeItem('interviewpilot_user');
      } finally {
        setIsInitializing(false);
      }
    }

    initAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    setAuthToken(newToken);
    localStorage.setItem('interviewpilot_user', JSON.stringify(newUser));
  };

  const logout = () => {
    // Clear JWT + user state (single source of truth).
    setToken(null);
    setUser(null);
    clearAuthToken();
    localStorage.removeItem('interviewpilot_user');
    // Disconnect any active Socket.IO connection.
    try {
      socketService.disconnect();
    } catch (e) {
      console.warn('Could not disconnect socket', e);
    }
    // Clear active interview state (Zustand).
    try {
      useInterviewStore.getState().reset();
    } catch (e) {
      console.warn('Could not reset store', e);
    }
    window.location.href = '/';
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        loading: isInitializing,
        isInitializing,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
