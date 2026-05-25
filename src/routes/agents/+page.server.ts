import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { booleanFromForm, stringFromForm } from '$lib/server/forms';
import {
	createAgent,
	deleteAgent,
	listAgents,
	listAvailableAgentTools,
	updateAgent,
	updateAgentDefault
} from '$lib/server/repositories/agents';
import { listMcpServers } from '$lib/server/repositories/mcp';

function stringsFromForm(form: FormData, key: string): string[] {
	return form.getAll(key).filter((value): value is string => typeof value === 'string');
}

function agentInputFromForm(form: FormData) {
	return {
		name: stringFromForm(form, 'name') ?? '',
		systemPrompt: typeof form.get('systemPrompt') === 'string' ? String(form.get('systemPrompt')) : '',
		toolNames: stringsFromForm(form, 'toolNames'),
		mcpServerIds: stringsFromForm(form, 'mcpServerIds'),
		isDefault: booleanFromForm(form, 'isDefault')
	};
}

export const load: PageServerLoad = async () => {
	try {
		return {
			agents: await listAgents(),
			agentTools: listAvailableAgentTools(),
			mcpServers: await listMcpServers(),
			loadError: null
		};
	} catch (error) {
		return {
			agents: [],
			agentTools: listAvailableAgentTools(),
			mcpServers: [],
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};

export const actions: Actions = {
	saveAgent: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const agent = id
				? await updateAgent(id, agentInputFromForm(form))
				: await createAgent(agentInputFromForm(form));
			return { ok: true, message: `${agent.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save agent' });
		}
	},
	defaultAgent: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Agent ID is required');
			const agent = await updateAgentDefault(id, { isDefault: true });
			return { ok: true, message: `${agent.name} set as default` };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to update default agent'
			});
		}
	},
	deleteAgent: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Agent ID is required');
			await deleteAgent(id);
			return { ok: true, message: 'Agent deleted' };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to delete agent' });
		}
	}
};
