FROM node:20-slim

# Prisma a besoin d'OpenSSL pour ses moteurs (schema-engine/query-engine).
# L'image "slim" (Debian) est plus fiable qu'Alpine pour Prisma, mais necessite
# quand meme l'installation explicite d'OpenSSL.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm install prisma --no-save

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
