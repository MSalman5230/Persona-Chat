import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { booleanFromForm, listFromLines, recordFromJson, stringFromForm } from '$lib/server/forms';
import { testMcpServer } from '$lib/server/mcp/adapter';
import { getSupportedProviders } from '$lib/server/providers/catalog';
import { createProviderRuntime } from '$lib/server/providers/runtime';
import { providerPayloadFromForm } from '$lib/server/providers/settings-form';
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
	getProviderConnection,
	listProviderConnections,
	updateProviderConnection
} from '$lib/server/repositories/providers';

export const load: PageServerLoad = async () => {
	const supportedProviders = getSupportedProviders();

	try {
		return {
			providers: await listProviderConnections(),
			supportedProviders,
			mcpServers: await listMcpServers(),
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			supportedProviders,
			mcpServers: [],
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};

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

async function saveProviderConnectionFromForm(form: FormData, id: string | undefined) {
	const supportedProviders = getSupportedProviders();

	if (!id) {
		return createProviderConnection(
			providerPayloadFromForm(form, { update: false, supportedProviders })
		);
	}

	const current = await getProviderConnection(id);
	if (!current) throw new Error('Provider connection not found');

	return updateProviderConnection(
		id,
		providerPayloadFromForm(form, {
			update: true,
			existingKind: current.kind,
			supportedProviders
		})
	);
}

export const actions: Actions = {
	saveProvider: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const provider = await saveProviderConnectionFromForm(form, id);
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
