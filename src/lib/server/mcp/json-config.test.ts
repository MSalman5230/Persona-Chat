import { describe, expect, it } from 'vitest';

import type { PublicMcpServer } from '$lib/server/repositories/mcp';

import {
	buildMcpJsonSyncOperations,
	buildMcpJsonUpserts,
	parseMcpJsonConfig,
	serializeMcpJsonConfig
} from './json-config';

function publicServer(overrides: Partial<PublicMcpServer> = {}): PublicMcpServer {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		name: 'Svelte',
		slug: 'svelte',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@sveltejs/mcp'],
		cwd: null,
		url: null,
		enabled: true,
		status: 'unknown',
		lastError: null,
		lastCheckedAt: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		hasEnvSecrets: false,
		hasHeaderSecrets: false,
		...overrides
	};
}

describe('MCP JSON config helpers', () => {
	it('parses the standard mcpServers shape and infers non-SSE transports', () => {
		const config = parseMcpJsonConfig(
			JSON.stringify({
				mcpServers: {
					svelte: {
						command: 'npx',
						args: ['-y', '@sveltejs/mcp'],
						cwd: 'C:/workspace',
						env: { TOKEN: 'secret' }
					},
					remote: {
						name: 'Remote MCP',
						url: 'https://mcp.example.test/mcp',
						headers: { Authorization: 'Bearer token' },
						enabled: false
					},
					legacy: {
						transport: 'sse',
						url: 'https://mcp.example.test/sse'
					}
				}
			})
		);

		expect(config.servers).toMatchObject([
			{ slug: 'svelte', transport: 'stdio', command: 'npx' },
			{ slug: 'remote', transport: 'streamable_http', enabled: false },
			{ slug: 'legacy', transport: 'sse' }
		]);
	});

	it('serializes saved servers without exposing env or header secrets', () => {
		const json = serializeMcpJsonConfig([
			publicServer({
				hasEnvSecrets: true,
				hasHeaderSecrets: true
			}),
			publicServer({
				id: '00000000-0000-0000-0000-000000000002',
				name: 'Legacy',
				slug: 'legacy',
				transport: 'sse',
				command: null,
				args: [],
				url: 'https://mcp.example.test/sse',
				enabled: false
			})
		]);
		const parsed = JSON.parse(json) as Record<string, unknown>;

		expect(json).toContain('"mcpServers"');
		expect(json).not.toContain('"env"');
		expect(json).not.toContain('"headers"');
		expect(parsed).toMatchObject({
			mcpServers: {
				legacy: {
					name: 'Legacy',
					url: 'https://mcp.example.test/sse',
					transport: 'sse',
					enabled: false
				},
				svelte: {
					name: 'Svelte',
					command: 'npx',
					args: ['-y', '@sveltejs/mcp']
				}
			}
		});
	});

	it('builds sync operations by slug and deletes omitted saved servers', () => {
		const existing = [
			publicServer(),
			publicServer({
				id: '00000000-0000-0000-0000-000000000002',
				name: 'Memory',
				slug: 'memory',
				command: 'node',
				args: ['memory.js']
			})
		];

		const sync = buildMcpJsonSyncOperations(
			parseMcpJsonConfig(
				JSON.stringify({
					mcpServers: {
						svelte: { command: 'pnpm', args: ['dlx', '@sveltejs/mcp'] },
						remote: { url: 'https://mcp.example.test/mcp' }
					}
				})
			),
			existing
		);

		expect(sync.upserts.map((item) => [item.mode, item.slug])).toEqual([
			['update', 'svelte'],
			['create', 'remote']
		]);
		expect(sync.upserts).not.toContainEqual(expect.objectContaining({ slug: 'memory' }));
		expect(sync.upserts[0].payload).toMatchObject({
			name: 'Svelte',
			command: 'pnpm',
			args: ['dlx', '@sveltejs/mcp']
		});
		expect(sync.deletes).toEqual([
			{ id: '00000000-0000-0000-0000-000000000002', slug: 'memory' }
		]);
	});

	it('does not delete servers when the JSON contains all existing slugs', () => {
		const existing = [
			publicServer(),
			publicServer({
				id: '00000000-0000-0000-0000-000000000002',
				name: 'Memory',
				slug: 'memory',
				command: 'node',
				args: ['memory.js']
			})
		];

		const sync = buildMcpJsonSyncOperations(
			parseMcpJsonConfig(
				JSON.stringify({
					mcpServers: {
						memory: { command: 'node', args: ['memory.js'] },
						svelte: { command: 'npx', args: ['-y', '@sveltejs/mcp'] }
					}
				})
			),
			existing
		);

		expect(sync.upserts.map((item) => [item.mode, item.slug])).toEqual([
			['update', 'memory'],
			['update', 'svelte']
		]);
		expect(sync.deletes).toEqual([]);
	});

	it('preserves omitted secrets and explicitly clears empty secret objects', () => {
		const [preserve] = buildMcpJsonUpserts(
			parseMcpJsonConfig(
				JSON.stringify({
					mcpServers: {
						svelte: { command: 'npx' }
					}
				})
			),
			[publicServer({ hasEnvSecrets: true, hasHeaderSecrets: true })]
		);
		expect(Object.hasOwn(preserve.payload, 'env')).toBe(false);
		expect(Object.hasOwn(preserve.payload, 'headers')).toBe(false);

		const [clear] = buildMcpJsonUpserts(
			parseMcpJsonConfig(
				JSON.stringify({
					mcpServers: {
						svelte: { command: 'npx', env: {}, headers: {} }
					}
				})
			),
			[publicServer({ hasEnvSecrets: true, hasHeaderSecrets: true })]
		);
		expect(clear.payload).toMatchObject({ env: {}, headers: {} });
	});

	it('returns targeted validation errors', () => {
		expect(() => parseMcpJsonConfig('{}')).toThrow(/mcpServers/);
		expect(() =>
			parseMcpJsonConfig(
				JSON.stringify({
					mcpServers: {
						bad: { transport: 'sse', command: 'node' }
					}
				})
			)
		).toThrow(/needs a url/);
		expect(() =>
			parseMcpJsonConfig(
				JSON.stringify({
					mcpServers: {
						'bad slug': { command: 'node' }
					}
				})
			)
		).toThrow(/key must contain/);
	});
});
