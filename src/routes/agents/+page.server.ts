import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { booleanFromForm, stringFromForm, stringsFromForm } from '$lib/server/forms';
import { authenticatedAccess } from '$lib/server/resource-policy';
import {
	createAgent,
	deleteAgent,
	listAgents,
	listAvailableAgentTools,
	updateAgent,
	updateAgentDefault
} from '$lib/server/repositories/agents';
import { listMcpServers } from '$lib/server/repositories/mcp';

function agentInputFromForm(form: FormData) {
	return {
		name: stringFromForm(form, 'name') ?? '',
		systemPrompt: typeof form.get('systemPrompt') === 'string' ? String(form.get('systemPrompt')) : '',
		toolNames: stringsFromForm(form, 'toolNames'),
		mcpServerIds: stringsFromForm(form, 'mcpServerIds'),
		isDefault: booleanFromForm(form, 'isDefault')
	};
}

export const load: PageServerLoad = async (event) => {
	const access = authenticatedAccess(event);
	try {
		return {
			agents: await listAgents(access.userId),
			agentTools: listAvailableAgentTools(),
			mcpServers: await listMcpServers(access.resources.runtime),
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
	saveAgent: async (event) => {
		const access = authenticatedAccess(event);
		try {
			const { request } = event;
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const agent = id
				? await updateAgent(access.userId, id, agentInputFromForm(form))
				: await createAgent(access.userId, agentInputFromForm(form));
			return { ok: true, message: `${agent.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save agent' });
		}
	},
	defaultAgent: async (event) => {
		const access = authenticatedAccess(event);
		try {
			const { request } = event;
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Agent ID is required');
			const agent = await updateAgentDefault(access.userId, id, { isDefault: true });
			return { ok: true, message: `${agent.name} set as default` };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to update default agent'
			});
		}
	},
	deleteAgent: async (event) => {
		const access = authenticatedAccess(event);
		try {
			const { request } = event;
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Agent ID is required');
			await deleteAgent(access.userId, id);
			return { ok: true, message: 'Agent deleted' };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to delete agent' });
		}
	}
};
