import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { authenticatedUser, requireAdmin } from '$lib/server/auth-guard';
import { booleanFromForm, stringFromForm, stringsFromForm } from '$lib/server/forms';
import { testMcpServer } from '$lib/server/mcp/adapter';
import { parseMcpJsonConfig, serializeMcpJsonConfig } from '$lib/server/mcp/json-config';
import { getSupportedProviders } from '$lib/server/providers/catalog';
import { createProviderRuntime } from '$lib/server/providers/runtime';
import { providerPayloadFromForm } from '$lib/server/providers/settings-form';
import { managementResourceFilter } from '$lib/server/resource-policy';
import {
	deleteMcpServer,
	getMcpServer,
	listMcpServers,
	syncMcpJsonConfig
} from '$lib/server/repositories/mcp';
import {
	createProviderConnection,
	deleteProviderConnection,
	getProviderConnection,
	listProviderConnections,
	saveUserProviderPreference,
	updateProviderConnection
} from '$lib/server/repositories/providers';

type SettingsLoadResult = Awaited<ReturnType<PageServerLoad>>;

function buildSettingsLoadResult(input: {
	isAdmin: boolean;
	supportedProviders: ReturnType<typeof getSupportedProviders>;
	providers?: Awaited<ReturnType<typeof listProviderConnections>>;
	mcpServers?: Awaited<ReturnType<typeof listMcpServers>>;
	loadError: string | null;
}): SettingsLoadResult {
	const mcpServers = input.mcpServers ?? [];

	return {
		isAdmin: input.isAdmin,
		providers: input.providers ?? [],
		supportedProviders: input.supportedProviders,
		mcpServers,
		mcpJson: input.isAdmin ? serializeMcpJsonConfig(mcpServers) : '',
		loadError: input.loadError
	};
}

export const load: PageServerLoad = async (event) => {
	const user = authenticatedUser(event);
	const supportedProviders = getSupportedProviders();
	const isAdmin = event.locals.isAdmin;
	const resourceFilter = managementResourceFilter(event);

	try {
		const [mcpServers, providers] = await Promise.all([
			listMcpServers(resourceFilter),
			listProviderConnections({ userId: user.id, ...resourceFilter })
		]);
		return buildSettingsLoadResult({
			isAdmin,
			supportedProviders,
			providers,
			mcpServers,
			loadError: null
		});
	} catch (error) {
		return buildSettingsLoadResult({
			isAdmin,
			supportedProviders,
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		});
	}
};

async function saveProviderConnectionFromForm(
	form: FormData,
	id: string | undefined,
	userId: string
) {
	const supportedProviders = getSupportedProviders();

	if (!id) {
		return createProviderConnection(
			providerPayloadFromForm(form, { update: false, supportedProviders }),
			{ userId }
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
		}),
		{ userId }
	);
}

export const actions: Actions = {
	saveProvider: async (event) => {
		const user = requireAdmin(event);
		try {
			const { request } = event;
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			const provider = await saveProviderConnectionFromForm(form, id, user.id);
			return { ok: true, message: `${provider.provider.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save provider' });
		}
	},
	deleteProvider: async (event) => {
		requireAdmin(event);
		const { request } = event;
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'Provider ID is required' });
		await deleteProviderConnection(id);
		return { ok: true, message: 'Provider deleted' };
	},
	testProvider: async (event) => {
		requireAdmin(event);
		try {
			const { request } = event;
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Provider ID is required');
			const runtime = await createProviderRuntime({ providerConnectionId: id });
			return {
				ok: true,
				message: `${runtime.provider.name} can load ${runtime.provider.providerId}/${runtime.model.id}`
			};
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Provider test failed' });
		}
	},
	saveProviderPreference: async (event) => {
		const user = authenticatedUser(event);
		try {
			const form = await event.request.formData();
			const id = stringFromForm(form, 'id');
			if (!id) throw new Error('Provider ID is required');
			const provider = await saveUserProviderPreference(user.id, {
				providerConnectionId: id,
				defaultModel: stringFromForm(form, 'defaultModel'),
				favoriteModels: stringsFromForm(form, 'favoriteModels'),
				isDefault: booleanFromForm(form, 'isDefault', false)
			});
			return { ok: true, message: `${provider.provider.name} preferences saved` };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to save provider preferences'
			});
		}
	},
	saveMcpJson: async (event) => {
		requireAdmin(event);
		const { request } = event;
		let submittedJson: string | undefined;
		try {
			const form = await request.formData();
			const mcpJson = form.get('mcpJson');
			if (typeof mcpJson !== 'string' || mcpJson.trim().length === 0) {
				throw new Error('MCP JSON is required');
			}
			submittedJson = mcpJson;

			const config = parseMcpJsonConfig(mcpJson);
			const { upsertCount, deleteCount } = await syncMcpJsonConfig(config);

			return {
				ok: true,
				message: `Saved ${upsertCount} MCP server${upsertCount === 1 ? '' : 's'}${
					deleteCount === 0
						? ''
						: `, deleted ${deleteCount} MCP server${deleteCount === 1 ? '' : 's'}`
				}`
			};
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to save MCP JSON',
				...(submittedJson !== undefined ? { mcpJson: submittedJson } : {})
			});
		}
	},
	deleteMcp: async (event) => {
		requireAdmin(event);
		const { request } = event;
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'MCP server ID is required' });
		await deleteMcpServer(id);
		return { ok: true, message: 'MCP server deleted' };
	},
	testMcp: async (event) => {
		requireAdmin(event);
		try {
			const { request } = event;
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
