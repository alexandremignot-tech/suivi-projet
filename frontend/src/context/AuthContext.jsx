import { createContext, useContext, useEffect, useState, useCallback } from "react";
import client from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    let token = localStorage.getItem("token");

    // Pas de token : on tente une connexion automatique (mode sans login, desactivable cote serveur
    // via AUTO_LOGIN=false). Si le serveur n'a pas ce mode actif, on retombe sur l'ecran de connexion.
    if (!token) {
      try {
        const { data } = await client.get("/auth/dev-session");
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setOrganization(data.organization);
      } catch {
        // Connexion automatique indisponible : ecran de login classique
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data } = await client.get("/auth/me");
      setUser(data.user);
      setOrganization(data.organization);
    } catch {
      localStorage.removeItem("token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  function login(token, user, organization) {
    localStorage.setItem("token", token);
    setUser(user);
    setOrganization(organization);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setOrganization(null);
  }

  return (
    <AuthContext.Provider value={{ user, organization, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
