'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import type { Cargo } from '@/types/index';

export interface UsuarioCtx {
  id: number;
  email: string;
  nome: string;
  cargo: Cargo;
  setores: string[];
  nome_vendedor: string | null;
}

const UserContext = createContext<UsuarioCtx | null | 'loading'>('loading');

export function UserProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioCtx | null | 'loading'>('loading');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setUsuario)
      .catch(() => setUsuario(null));
  }, []);

  return (
    <UserContext.Provider value={usuario}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
