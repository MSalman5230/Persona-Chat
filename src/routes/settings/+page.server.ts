import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { booleanFromForm, listFromLines, recordFromJson, stringFromForm } from '$lib/server/forms';
import { tryParseJsonObject } from '$lib/server/json';
import { testMcpServer } from '$lib/server/mcp/adapter';
import { createProviderRuntime } from '$lib/server/providers/runtime';
import {
	createMcpServer,
	deleteMcpServer,
	getMcpServer,
	listMcpServers,
	updateMcpServer
} from '$lib/server/repositories/mcp';
import {
	createProviderConnection,
	deleteProviderConnection,
	listProviderConnections,
	updateProviderConnection
} from '$lib/server/repositories/providers';

export const load: PageServerLoad = async () => {
	try {
		return {
			providers: await listProviderConnections(),
			mcpServers: await listMcpServers(),
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			mcpServers: [],
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};

function providerPayloadFromForm(form: FormData, update: boolean) {
	const defaultModel = stringFromForm(form, 'defaultModel');
	if (!defaultModel) throw new Error('Default model is required');

	const models = listFromLines(stringFromForm(form, 'models'));
	if (!models.includes(defaultModel)) models.unshift(defaultModel);

	const headersValue = stringFromForm(form, 'headersJson');
	const apiKey = stringFromForm(form, 'apiKey');
	const payload = {
		name: stringFromForm(form, 'name') ?? '',
		providerId: stringFromForm(form, 'providerId') ?? '',
		kind: (stringFromForm(form, 'kind') ?? 'built_in') as 'built_in' | 'custom',
		api: stringFromForm(form, 'api') ?? 'openai',
		baseUrl: stringFromForm(form, 'baseUrl') ?? null,
		defaultModel,
		defaultThinkingLevel: (stringFromForm(form, 'defaultThinkingLevel') ?? 'medium') as
			| 'off'
			| 'minimal'
			| 'low'
			| 'medium'
			| 'high'
			| 'xhigh',
		authHeader: booleanFromForm(form, 'authHeader', true),
		models,
		config: tryParseJsonObject(stringFromForm(form, 'configJson'), 'Provider config'),
		enabled: booleanFromForm(form, 'enabled', true),
		isDefault: booleanFromForm(form, 'isDefault', false),
		...(apiKey ? { apiKey } : {}),
		...(headersValue ? { headers: recordFromJson(headersValue, 'Headers') } : {})
	};

	if (!update && !payload.name) throw new Error('Provider name is required');
	if (!update && !payload.providerId) throw new Error('Provider ID is required');
	return payload;
}

function mcpPayloadFromForm(form: FormData, update: boolean) {
	const envValue = stringFromForm(form, 'envJson');
	const headersValue = stringFromForm(form, 'headersJson');
	const payload = {
		name: stringFromForm(form, 'name') ?? '',
		slug: stringFromForm(form, 'slug') ?? '',
		transport: (stringFromForm(form, 'transport') ?? 'stdio') as 'stdio' | 'streamable_http' | 'sse',
		command: stringFromForm(form, 'command') ?? null,
		args: listFromLines(stringFromForm(form, 'args')),
		cwd: stringFromForm(form, 'cwd') ?? null,
		url: stringFromForm(form, 'url') ?? null,
		enabled: booleanFromForm(form, 'enabled', true),
		...(envValue ? { env: recordFromJson(envValue, 'Environment') } : {}),
		...(headersValue ? { headers: recordFromJson(headersValue, 'Headers') } : {})
	};

	if (!update && !payload.name) throw new Error('MCP server name is required');
	if (!update && !payload.slug) throw new Error('MCP slug is required');
	return payload;
}

export const actions: Actions = {
	saveProvider: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const provider = id
				? await updateProviderConnection(id, providerPayloadFromForm(form, true))
				: await createProviderConnection(providerPayloadFromForm(form, false));
			return { ok: true, message: `${provider.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save provider' });
		}
	},
	deleteProvider: async ({ request }) => {
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'Provider ID is required' });
		await deleteProviderConnection(id);
		return { ok: true, message: 'Provider deleted' };
	},
	testProvider: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Provider ID is required');
			const runtime = await createProviderRuntime({ providerConnectionId: id });
			return {
				ok: true,
				message: `${runtime.row.name} can load ${runtime.row.providerId}/${runtime.model.id}`
			};
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Provider test failed' });
		}
	},
	saveMcp: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const server = id
				? await updateMcpServer(id, mcpPayloadFromForm(form, true))
				: await createMcpServer(mcpPayloadFromForm(form, false));
			return { ok: true, message: `${server.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save MCP server' });
		}
	},
	deleteMcp: async ({ request }) => {
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'MCP server ID is required' });
		await deleteMcpServer(id);
		return { ok: true, message: 'MCP server deleted' };
	},
	testMcp: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('MCP server ID is required');
			const server = await getMcpServer(id);
			if (!server) throw new Error('MCP server not found');
			const tools = await testMcpServer(server);
			return { ok: true, message: `${server.name} returned ${tools.length} tool(s)` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'MCP test failed' });
		}
	}
};
