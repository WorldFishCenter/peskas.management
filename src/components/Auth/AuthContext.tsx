import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { login as apiLogin, LoginErrorKey } from '../../api/auth';

export interface AuthUser {
  username: string;
  role: 'admin' | 'user';
  name?: string;
  country?: string[];
  language?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<{ success: boolean; errorKey?: LoginErrorKey; retryAfter?: number }>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check if user is already logged in (check for JWT token)
    const authToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('user');

    if (authToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch {
        // Invalid stored user, clear everything
        localStorage.removeItem('user');
        localStorage.removeItem('authToken');
      }
    } else {
      // If token or user is missing, clear both
      localStorage.removeItem('user');
      localStorage.removeItem('authToken');
    }
    setLoading(false);
  }, []);

  // Not the app-wide `loading`: that swaps the whole page for a spinner and would throw away the
  // sign-in form, and with it any error message.
  const login = async (username: string, password: string): Promise<{ success: boolean; errorKey?: LoginErrorKey; retryAfter?: number }> => {
    const result = await apiLogin(username, password);

    if (result.success && result.user && result.token) {
      localStorage.setItem('authToken', result.token);

      const userData: AuthUser = {
        username: result.user.username,
        role: result.user.role as 'admin' | 'user',
        name: result.user.name,
        country: result.user.country,
        language: result.user.language || 'en'
      };
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('user', JSON.stringify(userData));

      if (userData.language && userData.language !== i18n.language) {
        await i18n.changeLanguage(userData.language);
        localStorage.setItem('i18n_language', userData.language);
      }

      return { success: true };
    }
    return { success: false, errorKey: result.errorKey ?? 'serverUnavailable', retryAfter: result.retryAfter };
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    // Clear both user data and JWT token
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}; 