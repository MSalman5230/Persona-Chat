# Persona Chat

Single-user SvelteKit chat app backed by PI SDK, Drizzle/Postgres provider settings, encrypted credentials, app-defined tools, and MCP-derived tools.

## Environment

Configure Postgres and credential encryption before saving providers or MCP secrets:

```sh
DATABASE_URL="postgres://user:password@host:port/db-name"
CREDENTIAL_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
```

## Database

```sh
pnpm db:migrate
```

## Developing

```sh
pnpm install
pnpm dev
```

## Verification

```sh
pnpm check
pnpm test
pnpm build
```
