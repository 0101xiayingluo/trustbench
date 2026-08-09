FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/creator-studio/package.json apps/creator-studio/package-lock.json ./apps/creator-studio/
RUN npm ci && npm --prefix apps/creator-studio ci && npx playwright install --with-deps chromium

COPY . .
RUN npm --prefix apps/creator-studio run build

EXPOSE 4173

CMD ["npm", "run", "start"]
