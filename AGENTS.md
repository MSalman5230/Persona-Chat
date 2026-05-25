## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: tailwindcss, drizzle, mcp

---

## Dev Server

- **Never** run `pnpm server` (or start the dev server yourself).
- If you need the server, check whether it is already up (e.g. existing terminal sessions or a reachable dev URL).
- If it is not running, ask the user to start it, then continue with your planned work (testing in the browser, verifying a change, etc.) once they confirm it is available.

---

## PI SDK Guidance

Whenever writing code for the PI SDK, use the local repository at `C:\MegaSync\Projects\Git\pi` as the source for documentation, examples, and implementation patterns.

---

## Auth Guidance

This project uses **Better Auth** for authentication. Whenever making changes to auth code, use the official documentation at https://better-auth.com/llms.txt as the source for implementation patterns and API reference.

---

## UI Guidance

Whenever making UI changes or building frontend experiences, read `DESIGN.md` first and follow its design guidance.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
