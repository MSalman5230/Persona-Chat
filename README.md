# Persona Chat

MIT License — see [LICENSE](LICENSE).

Persona Chat is a focused SvelteKit chat workspace for running PI SDK-powered agents with encrypted provider credentials, persisted chats, app tools, and MCP tool access.

## Features

- PI SDK-backed agent chat with streaming responses.
- Persisted chat sessions, markdown rendering, thinking controls, and temperature settings.
- Custom agents with system prompts plus scoped app-tool and MCP-server access.
- 25+ PI-supported providers to choose from, plus custom providers for OpenAI, Anthropic, and Google GenAI-compatible APIs.
- MCP server management, JSON sync, and progressive tool discovery/calling.
- Built-in tools for current date/time and sandboxed Python/JavaScript execution.
- Better Auth login with email/password, optional Google auth, and first-user admin bootstrap.

## How This Is Different

Open WebUI is a broad self-hosted AI platform for teams, with many product surfaces such as multi-model chat, RAG/knowledge, channels, voice and image features, automations, RBAC, and extensibility. Persona Chat is smaller and more opinionated: a code-first, PI SDK-native personal agent workspace focused on curated agents, provider/MCP configuration, encrypted secrets, and a minimal chat surface.

## Environment

Configure Postgres and credential encryption before saving providers or MCP secrets.

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
