import { z } from 'zod';

export const AGENT_NAME_MAX_LENGTH = 80;
export const AGENT_SYSTEM_PROMPT_MAX_LENGTH = 20_000;

export type Agent = {
	id: string;
	name: string;
	systemPrompt: string;
	toolNames: string[];
	mcpServerIds: string[];
	isDefault: boolean;
	createdAt: Date | string;
	updatedAt: Date | string;
};

export type AgentToolOption = {
	name: string;
	label: string;
	description: string;
};

export const agentInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Agent name is required')
			.max(AGENT_NAME_MAX_LENGTH, 'Agent name is too long'),
		systemPrompt: z
			.string()
			.max(AGENT_SYSTEM_PROMPT_MAX_LENGTH, 'System prompt is too long')
			.default(''),
		toolNames: z.array(z.string().min(1)).default([]),
		mcpServerIds: z.array(z.string().uuid()).default([]),
		isDefault: z.boolean().optional()
	})
	.strict();

export const agentDefaultPatchSchema = z
	.object({
		isDefault: z.boolean()
	})
	.strict();

export type AgentInput = z.input<typeof agentInputSchema>;
export type AgentDefaultPatchInput = z.input<typeof agentDefaultPatchSchema>;

export function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}

	return result;
}

export function orderAgents<TAgent extends { isDefault: boolean; name: string }>(
	agents: TAgent[]
): TAgent[] {
	return [...agents].sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
}

export function defaultAgent<TAgent extends { isDefault: boolean }>(agents: TAgent[]): TAgent | null {
	return agents.find((agent) => agent.isDefault) ?? null;
}
