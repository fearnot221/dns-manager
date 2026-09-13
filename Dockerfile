FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
# The VM installer uses umask 077. Source files can be 0600 / directories 0700;
# assign them and generated Prisma dependencies to the account that runs migrations.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN chown node:node /app
USER node
RUN npm run lint && npm test && npm run build

FROM builder AS tools
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:migrate"]

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node scripts/start-production.mjs ./scripts/start-production.mjs
USER node
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
