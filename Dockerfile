# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Зависимости для production ставим отдельно, чтобы в финальный образ не
# уехали vite, typescript и прочий инструментарий сборки.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22-alpine
# Клиент docker нужен процессу сведения состояний. Веб-контейнеру сокет не
# пробрасывается, поэтому там этот клиент ничего не может.
RUN apk add --no-cache docker-cli
# Kamal проверяет эту метку перед запуском. Обычно он ставит её сам, но образ
# собирается в Actions, поэтому метку задаём здесь.
LABEL service="zerotomvp"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY package.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
