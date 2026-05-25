import { describe, expect, it } from 'vitest';

import { agentInputSchema, defaultAgent, orderAgents, uniqueStrings } from './agents';

describe('agent helpers', () => {
	it('validates agent input and preserves blank system prompts', () => {
		expect(
			agentInputSchema.parse({
				name: '  Researcher  ',
				systemPrompt: '',
				toolNames: ['current_datetime'],
				mcpServerIds: ['00000000-0000-4000-8000-000000000001']
			})
		).toEqual({
			name: 'Researcher',
			systemPrompt: '',
			toolNames: ['current_datetime'],
			mcpServerIds: ['00000000-0000-4000-8000-000000000001']
		});
	});

	it('rejects invalid names, long prompts, and non-uuid MCP server ids', () => {
		expect(() => agentInputSchema.parse({ name: '', systemPrompt: '' })).toThrow();
		expect(() =>
			agentInputSchema.parse({ name: 'Agent', systemPrompt: 'x'.repeat(20_001) })
		).toThrow();
		expect(() =>
			agentInputSchema.parse({
				name: 'Agent',
				systemPrompt: '',
				mcpServerIds: ['not-a-uuid']
			})
		).toThrow();
	});

	it('deduplicates tool and server identifiers without reordering first appearances', () => {
		expect(uniqueStrings(['read', ' read ', 'bash', '', 'bash'])).toEqual(['read', 'bash']);
	});

	it('finds and orders the default agent first', () => {
		const agents = [
			{ id: '1', name: 'Writer', isDefault: false },
			{ id: '2', name: 'Analyst', isDefault: true },
			{ id: '3', name: 'Coder', isDefault: false }
		];

		expect(defaultAgent(agents)).toEqual(agents[1]);
		expect(orderAgents(agents).map((agent) => agent.name)).toEqual([
			'Analyst',
			'Coder',
			'Writer'
		]);
	});
});
