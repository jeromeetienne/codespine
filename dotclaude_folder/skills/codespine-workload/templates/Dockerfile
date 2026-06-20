# codespine-workload runner image (copy into ./.codespine/workload/, build, reuse).
#
# A minimal Node image carrying just the toolchain a workload driver needs: tsx (to
# run the TypeScript driver and a tsx-compatible server) and autocannon (the HTTP
# load generator, used only by the loadtest driver). The project source and the
# driver are bind-mounted at run time; nothing is COPYed in, so this image is
# generic and cache-stable across projects.
#
# Build:  docker build -t codespine-workload-runner .codespine/workload
#
# If your project has runtime dependencies with NATIVE addons (e.g. better-sqlite3),
# the container needs a Linux build of them — a macOS/Windows node_modules will not
# run in the Linux VM. Provision them into a volume (npm ci inside this image) and
# mount it at /work/node_modules:ro, or install them into the image. When that is
# painful, run on the host instead (no container, uses your existing node_modules).
FROM node:24-slim

WORKDIR /opt/runner
RUN npm init -y >/dev/null && npm install tsx@4 autocannon@7
