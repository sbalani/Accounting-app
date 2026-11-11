# Official multi-architecture Node 24.19.0 image index (same immutable digest in all stages).
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# These values are public and are embedded in browser JS at build time.
# Set them for the destination before building; never supply service-role keys here.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# libheif's WASM loader performs dynamic requires/readFileSync, which Next's
# file tracer cannot reliably discover. Keep these runtime assets explicitly.
COPY --from=builder --chown=node:node /app/node_modules/libheif-js ./node_modules/libheif-js
COPY --from=builder --chown=node:node /app/node_modules/heic-decode ./node_modules/heic-decode
COPY --from=builder --chown=node:node /app/node_modules/heic-convert ./node_modules/heic-convert
COPY --from=builder --chown=node:node /app/node_modules/jpeg-js ./node_modules/jpeg-js
COPY --from=builder --chown=node:node /app/node_modules/pngjs ./node_modules/pngjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})"]
CMD ["node", "server.js"]
