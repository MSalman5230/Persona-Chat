import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { requireAdmin } from '$lib/server/auth/guards';
import { stringFromForm } from '$lib/server/forms';
import { testMcpServer } from '$lib/server/mcp/adapter';
import {
	buildMcpJsonSyncOperations,
	parseMcpJsonConfig,
	serializeMcpJsonConfig
} from '$lib/server/mcp/json-config';
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

export const load: PageServerLoad = async ({ locals }) => {
	await requireAdmin(locals);
	const supportedProviders = getSupportedProviders();

	try {
		const mcpServers = await listMcpServers();
		return {
			providers: await listProviderConnections(),
			supportedProviders,
			mcpServers,
			mcpJson: serializeMcpJsonConfig(mcpServers),
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			supportedProviders,
			mcpServers: [],
			mcpJson: serializeMcpJsonConfig([]),
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};

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
			existingBaseUrl: current.baseUrl,
			existingProviderId: current.providerId,
			supportedProviders
		})
	);
}

export const actions: Actions = {
	saveProvider: async ({ request, locals }) => {
		await requireAdmin(locals);
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const provider = await saveProviderConnectionFromForm(form, id);
			return { ok: true, message: `${provider.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save provider' });
		}
	},
	deleteProvider: async ({ request, locals }) => {
		await requireAdmin(locals);
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'Provider ID is required' });
		await deleteProviderConnection(id);
		return { ok: true, message: 'Provider deleted' };
	},
	testProvider: async ({ request, locals }) => {
		await requireAdmin(locals);
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
	saveMcpJson: async ({ request, locals }) => {
		await requireAdmin(locals);
		let submittedJson: string | undefined;
		try {
			const form = await request.formData();
			const mcpJson = form.get('mcpJson');
			if (typeof mcpJson !== 'string' || mcpJson.trim().length === 0) {
				throw new Error('MCP JSON is required');
			}
			submittedJson = mcpJson;

			const config = parseMcpJsonConfig(mcpJson);
			const existingServers = await listMcpServers();
			const { upserts, deletes } = buildMcpJsonSyncOperations(
				config,
				existingServers
			);

			for (const upsert of upserts) {
				if (upsert.mode === 'update') {
					await updateMcpServer(upsert.id, upsert.payload);
				} else {
					await createMcpServer(upsert.payload);
				}
			}
			for (const deletedServer of deletes) {
				await deleteMcpServer(deletedServer.id);
			}

			return {
				ok: true,
				message: `Saved ${upserts.length} MCP server${upserts.length === 1 ? '' : 's'}${
					deletes.length === 0
						? ''
						: `, deleted ${deletes.length} MCP server${deletes.length === 1 ? '' : 's'}`
				}`
			};
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to save MCP JSON',
				...(submittedJson !== undefined ? { mcpJson: submittedJson } : {})
			});
		}
	},
	deleteMcp: async ({ request, locals }) => {
		await requireAdmin(locals);
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'MCP server ID is required' });
		await deleteMcpServer(id);
		return { ok: true, message: 'MCP server deleted' };
	},
	testMcp: async ({ request, locals }) => {
		await requireAdmin(locals);
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
