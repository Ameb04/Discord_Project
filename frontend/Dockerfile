FROM node:22-alpine

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

WORKDIR /app

# Workspace root — install deps before copying source (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile --filter frontend

COPY frontend ./frontend

WORKDIR /app/frontend

EXPOSE 5173

CMD ["pnpm", "run", "dev"]
