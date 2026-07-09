FROM node:20-slim

# Prisma a besoin d'OpenSSL pour ses moteurs (schema-engine/query-engine).
# L'image "slim" (Debian) est plus fiable qu'Alpine pour Prisma, mais necessite
# quand meme l'installation explicite d'OpenSSL.
#
# libreoffice-writer : conversion .docx -> .pdf fidele (contrats), via "soffice --headless"
# (voir backend/src/utils/docxToPdf.js). Les polices utilisees par les templates KARNO sont deja
# embarquees dans les .docx eux-memes : aucun paquet de polices supplementaire n'est necessaire.
# Recommends conserves pour libreoffice-writer (pas de --no-install-recommends) : image plus
# lourde mais installation plus fiable (evite un runtime cassé par une dependance manquante).
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && apt-get install -y libreoffice-writer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm install prisma --no-save

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
