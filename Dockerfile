# --- Builder: install and compile on the build machine's native platform ---
# The production dependencies are plain JavaScript (no native modules), so node_modules and
# build/ are the same for every target platform. Building them natively keeps npm out of QEMU:
# an emulated arm64 `npm install` used to hang until the CI job timed out.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .
ARG RELEASE_VERSION
ENV RELEASE_VERSION=${RELEASE_VERSION}
RUN npm run build && npm prune --omit=dev --ignore-scripts --legacy-peer-deps


# --- Runtime: official Node 22 Alpine, per target platform ---
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache tini

COPY . .

# Production dependencies and compiled server from the builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build

CMD ["tini", "--", "node", "build/main.js"]
