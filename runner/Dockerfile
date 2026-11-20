# The match runner, for a host such as Railway. Build context: the repository root.
#   docker build -f runner/Dockerfile -t ghostbet-runner .
# Secrets come from environment variables (see runner/README.md, "Hosting"): none are in the image.
FROM node:24-slim

WORKDIR /app

# @arena/sdk: built here, because program/sdk/dist is not in git.
COPY program/sdk/package.json program/sdk/package-lock.json program/sdk/
RUN cd program/sdk && npm ci --no-audit --no-fund
COPY program/sdk program/sdk
COPY program/DEPLOYED.json program/DEPLOYED.json
RUN cd program/sdk && npm run build && npm prune --omit=dev --no-audit --no-fund

# The runner (TypeScript runs as is: Node strips the types).
COPY runner/package.json runner/package-lock.json runner/
RUN cd runner && npm ci --omit=dev --no-audit --no-fund
COPY runner runner

# The game adapters the runner loads (rules and simulations only; art and audio stay out, see .dockerignore).
COPY games games

ENV NODE_ENV=production \
    CHAIN=solana \
    CHANNELS=scrivener,brawl,tumbletop

WORKDIR /app/runner
EXPOSE 8787
CMD ["node", "src/index.ts"]
