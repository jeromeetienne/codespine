# Capacity-test runner image (realism track, ADR 0001).
#
# A separate image from the profiling runner (scripts/docker/Dockerfile) so adding
# the load generator never disturbs the working profile path. It carries just the
# toolchain the load driver needs: tsx (to run the TypeScript driver and the
# server) and autocannon (the HTTP load generator). The driver, the sample project
# source, and the project's Linux-built node_modules are bind-mounted at run time;
# nothing is COPYed in.
#
# Build:  docker build -t tkg-loadtest-runner:node24 scripts/loadtest
FROM node:24-slim

# tsx + autocannon in a fixed directory that is NOT the project mount (/work). The
# container's working directory is /opt/runner, so `node --import tsx` resolves the
# loader and `import autocannon` resolve from here, while the server's own bare
# imports (express, better-sqlite3) resolve against /work/node_modules at run time.
WORKDIR /opt/runner
RUN npm init -y >/dev/null && npm install tsx@4 autocannon@7
