# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

# Dependency layer: a clean install straight from the lockfile, so what the image runs is
# exactly what `npm ci` reproduces.
FROM node:${NODE_VERSION}-alpine AS deps
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
RUN npm config set registry "${NPM_REGISTRY}"
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

# Test stage: keeps the dev dependencies Vitest needs and runs the e2e suite.
FROM node:${NODE_VERSION}-alpine AS test
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "test:e2e"]

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
