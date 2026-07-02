#!/bin/bash
# Double-cliquez sur ce fichier dans le Finder pour arreter l'application.
cd "$(dirname "$0")"
docker compose down
echo "Application arretee."
read -p "Appuyez sur Entree pour fermer cette fenetre..."
