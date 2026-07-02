#!/bin/bash
# Double-cliquez sur ce fichier dans le Finder pour demarrer l'application.
cd "$(dirname "$0")"

if ! command -v docker &> /dev/null; then
  osascript -e 'display dialog "Docker n'"'"'est pas installe sur cet ordinateur.\n\nInstallez Docker Desktop depuis https://www.docker.com/products/docker-desktop, ouvrez-le une fois, puis relancez ce script." buttons {"OK"} with icon caution with title "Suivi de Projet"'
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fichier .env cree a partir de .env.example (a personnaliser si besoin)."
fi

echo "======================================"
echo " Demarrage de l'application..."
echo " (la premiere fois peut prendre 1 a 3 minutes)"
echo "======================================"

docker compose up -d --build

echo "Attente du demarrage du serveur..."
for i in $(seq 1 60); do
  if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

open http://localhost:5173

echo ""
echo "L'application est disponible sur : http://localhost:5173"
echo "Pour l'arreter, utilisez le fichier 'Arreter l'application.command'"
echo ""
read -p "Appuyez sur Entree pour fermer cette fenetre..."
