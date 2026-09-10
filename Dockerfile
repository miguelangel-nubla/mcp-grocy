# Default: official Node 22 Alpine (exact runtime). Home Assistant addons override via build.yaml.
ARG BUILD_FROM=node:22-alpine


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

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies but skip the prepare script which runs build
# We set fetch-retry-maxtimeout and --maxsockets 1 to prevent QEMU network hangs when building for arm64 on amd64
RUN npm config set fetch-retry-maxtimeout 600000 -g && \
    npm config set legacy-peer-deps true -g && \
    npm install --ignore-scripts --maxsockets 1

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

ARG RELEASE_VERSION
ENV RELEASE_VERSION=${RELEASE_VERSION}
RUN npm run build


# --- Entrypoint & Command ---
# For Home Assistant addon builds, the entrypoint is /init (from S6-Overlay in the base image).
# CMD is also typically handled by S6 services defined in rootfs.
# By not specifying ENTRYPOINT or CMD here, we rely on the base image's defaults when built as an addon.

# For regular Docker builds, set default command
CMD ["tini", "--", "node", "build/main.js"]