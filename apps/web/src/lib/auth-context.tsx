'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type {
  AuthUser,
  UserOrganizationMembership,
  OrganizationSummary,
  UserRole,
  Permission,
} from '@aegisops/types';
import { ROLE_PERMISSIONS, hasPermission } from '@aegisops/types';
import { api, ApiError } from './api';

interface AuthContextType {
  user: AuthUser | null;
  memberships: UserOrganizationMembership[];
  activeOrganization: OrganizationSummary | null;
  currentRole: UserRole | null;
  currentPermissions: readonly Permission[];
  isLoading: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: {
    displayName: string;
    email: string;
    password: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  switchOrganization: (organizationId: string) => void;
  refreshAuth: () => Promise<void>;
  hasAccess: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_ORG_KEY = 'aegisops_active_org_id';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<UserOrganizationMembership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const syncActiveOrg = useCallback(
    (members: UserOrganizationMembership[], preferredId?: string | null) => {
      if (!members || members.length === 0) {
        setActiveOrgId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(ACTIVE_ORG_KEY);
        }
        return;
      }

      const storedId =
        preferredId ||
        (typeof window !== 'undefined'
          ? localStorage.getItem(ACTIVE_ORG_KEY)
          : null);

      const matched = members.find((m) => m.organization.id === storedId);
      const selected = matched ? matched.organization.id : members[0].organization.id;

      setActiveOrgId(selected);
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_ORG_KEY, selected);
      }
    },
    [],
  );

  const refreshAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.auth.me();
      setUser(data.user);
      setMemberships(data.memberships);
      syncActiveOrg(data.memberships);
    } catch (err: any) {
      setUser(null);
      setMemberships([]);
      setActiveOrgId(null);
      if (err instanceof ApiError && err.statusCode === 401) {
        setError(null);
      } else {
        setError(err.message || 'Failed to authenticate');
      }
    } finally {
      setIsLoading(false);
    }
  }, [syncActiveOrg]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.auth.login(credentials);
      await refreshAuth();
    } catch (err: any) {
      setIsLoading(false);
      const msg = err.message || 'Login failed';
      setError(msg);
      throw err;
    }
  };

  const register = async (data: {
    displayName: string;
    email: string;
    password: string;
    organizationName: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.auth.register(data);
      if (typeof window !== 'undefined' && res.initialOrganizationId) {
        localStorage.setItem(ACTIVE_ORG_KEY, res.initialOrganizationId);
      }
      await refreshAuth();
    } catch (err: any) {
      setIsLoading(false);
      const msg = err.message || 'Registration failed';
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setMemberships([]);
      setActiveOrgId(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_ORG_KEY);
      }
      setIsLoading(false);
    }
  };

  const logoutAll = async () => {
    setIsLoading(true);
    try {
      await api.auth.logoutAll();
    } catch (err) {
      console.error('Logout-all error:', err);
    } finally {
      setUser(null);
      setMemberships([]);
      setActiveOrgId(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_ORG_KEY);
      }
      setIsLoading(false);
    }
  };

  const switchOrganization = (orgId: string) => {
    const exists = memberships.some((m) => m.organization.id === orgId);
    if (exists) {
      setActiveOrgId(orgId);
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      }
    }
  };

  const activeMembership = memberships.find(
    (m) => m.organization.id === activeOrgId,
  );

  const activeOrganization = activeMembership
    ? activeMembership.organization
    : null;

  const currentRole = activeMembership ? activeMembership.role : null;

  const currentPermissions: readonly Permission[] = currentRole
    ? ROLE_PERMISSIONS[currentRole]
    : [];

  const checkAccess = useCallback(
    (permission: Permission): boolean => {
      if (!currentRole) return false;
      return hasPermission(currentRole, permission);
    },
    [currentRole],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeOrganization,
        currentRole,
        currentPermissions,
        isLoading,
        error,
        login,
        register,
        logout,
        logoutAll,
        switchOrganization,
        refreshAuth,
        hasAccess: checkAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

