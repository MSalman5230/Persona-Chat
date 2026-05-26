import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { requireUser } from '$lib/server/auth/guards';
import { booleanFromForm, stringFromForm } from '$lib/server/forms';
import {
	clonePrebuiltGeneralAgent,
	createAgent,
	deleteAgent,
	listAgents,
	listAvailableAgentTools,
	updateAgent,
	updateAgentDefault
} from '$lib/server/repositories/agents';
import { listEnabledMcpServerOptions } from '$lib/server/repositories/mcp';

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

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	try {
		return {
			agents: await listAgents(user.id),
			agentTools: listAvailableAgentTools(),
			mcpServers: await listEnabledMcpServerOptions(),
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
	saveAgent: async ({ request, locals }) => {
		const user = requireUser(locals);
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const agent = id
				? await updateAgent(user.id, id, agentInputFromForm(form))
				: await createAgent(user.id, agentInputFromForm(form));
			return { ok: true, message: `${agent.name} saved`, agentId: agent.id };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save agent' });
		}
	},
	defaultAgent: async ({ request, locals }) => {
		const user = requireUser(locals);
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Agent ID is required');
			const agent = await updateAgentDefault(user.id, id, { isDefault: true });
			return { ok: true, message: `${agent.name} set as default`, agentId: agent.id };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to update default agent'
			});
		}
	},
	deleteAgent: async ({ request, locals }) => {
		const user = requireUser(locals);
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Agent ID is required');
			await deleteAgent(user.id, id);
			return { ok: true, message: 'Agent deleted' };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to delete agent' });
		}
	},
	clonePrebuiltAgent: async ({ locals }) => {
		const user = requireUser(locals);
		try {
			const agent = await clonePrebuiltGeneralAgent(user.id);
			return { ok: true, message: `${agent.name} created`, agentId: agent.id };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to copy Prebuilt General Agent'
			});
		}
	}
};
