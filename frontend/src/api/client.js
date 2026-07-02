import axios from "axios";

// En dev, VITE_API_URL pointe vers http://localhost:4000/api
// En prod, on met a jour cette variable d'environnement au build
const baseURL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// Origine du serveur (sans le /api final), utile pour construire les liens vers les fichiers uploades
export const API_ORIGIN = baseURL.replace(/\/api\/?$/, "");

export function fileUrl(relativeUrl) {
  if (!relativeUrl) return null;
  if (relativeUrl.startsWith("http")) return relativeUrl;
  return `${API_ORIGIN}${relativeUrl}`;
}

const client = axios.create({ baseURL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default client;
