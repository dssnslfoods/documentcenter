# Cloud Run image — builds the TanStack Start app with the `node-server` nitro
# preset (see vite.config.ts) and runs the plain Node output. Fronted by
# Firebase Hosting via a "run" rewrite (see firebase.json).

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
