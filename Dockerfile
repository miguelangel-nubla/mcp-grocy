# Default: official Node 22 Alpine (exact runtime). Home Assistant addons override via build.yaml.
ARG BUILD_FROM=node:22-alpine

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


FROM $BUILD_FROM AS base
ARG NODE_VERSION=22 # Default Node.js version for addon OS setup
ARG BUILD_FROM # Re-declare ARG to make it available in this stage
WORKDIR /app

# Arguments for pre-installed packages, primarily for docker builds.

# --- OS Level Setup ---
# This section handles OS package installations.
# It differentiates between addon builds and docker builds.

# Common packages needed by the application or build process
RUN if echo "$BUILD_FROM" | grep -q "home-assistant"; then \
    # Home Assistant base already has curl and jq
    echo "Installing Node.js v${NODE_VERSION} for Home Assistant addon..." && \
    apk add --no-cache nodejs npm && \
    rm -rf /tmp/* /var/tmp/*; \
else \
    echo "Docker build: ensuring Node + tini..." && \
    ( command -v node >/dev/null 2>&1 || apk add --no-cache nodejs npm ) && \
    apk add --no-cache tini && \
    rm -rf /tmp/* /var/tmp/*; \
fi

# COPY . . should come before conditional rootfs copy if rootfs might overlay app files,
# or after if app files might overlay rootfs defaults.
# Assuming app files are primary, then addon specifics overlay.
COPY . .

# --- Addon Specific: Copy rootfs for S6-Overlay and other addon specific files ---
RUN if echo "$BUILD_FROM" | grep -q "home-assistant"; then \
    echo "Addon build: Copying rootfs contents..." && \
    # Ensure rootfs directory exists in the build context
    if [ -d "rootfs" ]; then \
      cp -r rootfs/. / ; \
    else \
      echo "Warning: rootfs directory not found, skipping copy."; \
    fi; \
  else \
    echo "docker build: Skipping rootfs copy."; \
  fi

# Production dependencies and compiled server from the builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build


# --- Entrypoint & Command ---
# For Home Assistant addon builds, the entrypoint is /init (from S6-Overlay in the base image).
# CMD is also typically handled by S6 services defined in rootfs.
# By not specifying ENTRYPOINT or CMD here, we rely on the base image's defaults when built as an addon.

# For regular Docker builds, set default command
CMD ["tini", "--", "node", "build/main.js"]