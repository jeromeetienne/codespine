# Workload-runner image for the realism track (ADR 0001).
#
# Runs ONLY the V8 profiling step of a sample project's workload under enforced
# cgroup limits; `enrich` still runs on the host. The image therefore needs just
# `tsx` plus (optionally) `iproute2` for in-container tc/netem network shaping.
# The sample project source and the profile output directory are bind-mounted at
# run time (/work read-only, /prof read-write); nothing is COPYed in.
#
# Build:  docker build -t tkg-workload-runner:node24 scripts/docker
FROM node:24-slim

# iproute2 provides `tc` for in-container netem (ADR §4); harmless when unused.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends iproute2 \
	&& rm -rf /var/lib/apt/lists/*

# tsx in a fixed directory that is NOT the project mount (/work). The container's
# working directory is /opt/runner, so `node --import tsx` resolves the loader
# from here, while the driver's own `./src/...` imports resolve against /work
# (ESM relative imports are file-relative, independent of the working directory).
WORKDIR /opt/runner
RUN npm init -y >/dev/null && npm install tsx@4
