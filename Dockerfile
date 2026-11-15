FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3307 HOST=0.0.0.0 DATA_DIR=/app/data HOME=/app
WORKDIR /app
ARG PUID=1026
ARG PGID=100
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY --from=build /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
RUN (getent group ${PGID} >/dev/null || groupadd --gid ${PGID} mingo) && useradd --uid ${PUID} --gid ${PGID} --home-dir /app --no-create-home --shell /usr/sbin/nologin mingo && mkdir -p /app/data && chown -R ${PUID}:${PGID} /app
USER ${PUID}:${PGID}
EXPOSE 3307
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3307/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
