import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
	deleteAdminMcpServer,
	emptyAdminMcpJson,
	listAdminMcpServers,
	serializeAdminMcpJson,
	syncAdminMcpJson,
	testAdminMcpServer
} from '$lib/server/admin-settings/mcp';
import {
	deleteAdminProvider,
	getAdminSupportedProviders,
	listAdminProviderConnections,
	saveAdminProviderFromForm,
	testAdminProvider
} from '$lib/server/admin-settings/providers';
import { stringFromForm } from '$lib/server/forms';

export const load: PageServerLoad = async () => {
	const supportedProviders = getAdminSupportedProviders();

	try {
		const [providers, mcpServers] = await Promise.all([
			listAdminProviderConnections(),
			listAdminMcpServers()
		]);

		return {
			providers,
			supportedProviders,
			mcpServers,
			mcpJson: serializeAdminMcpJson(mcpServers),
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			supportedProviders,
			mcpServers: [],
			mcpJson: emptyAdminMcpJson(),
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};

export const actions: Actions = {
	saveProvider: async ({ request }) => {
		try {
			const form = await request.formData();
			const provider = await saveAdminProviderFromForm(form);
			return { ok: true, message: `${provider.name} saved` };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save provider' });
		}
	},
	deleteProvider: async ({ request }) => {
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'Provider ID is required' });
		await deleteAdminProvider(id);
		return { ok: true, message: 'Provider deleted' };
	},
	testProvider: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			return { ok: true, message: await testAdminProvider(id ?? '') };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Provider test failed' });
		}
	},
	saveMcpJson: async ({ request }) => {
		let submittedJson: string | undefined;
		try {
			const form = await request.formData();
			const mcpJson = form.get('mcpJson');
			if (typeof mcpJson !== 'string' || mcpJson.trim().length === 0) {
				throw new Error('MCP JSON is required');
			}
			submittedJson = mcpJson;

			return { ok: true, message: await syncAdminMcpJson(mcpJson) };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to save MCP JSON',
				...(submittedJson !== undefined ? { mcpJson: submittedJson } : {})
			});
		}
	},
	deleteMcp: async ({ request }) => {
		const form = await request.formData();
		const id = stringFromForm(form, 'id');
		if (!id) return fail(400, { error: 'MCP server ID is required' });
		await deleteAdminMcpServer(id);
		return { ok: true, message: 'MCP server deleted' };
	},
	testMcp: async ({ request }) => {
		try {
			const form = await request.formData();
			const id = stringFromForm(form, 'id');
			return { ok: true, message: await testAdminMcpServer(id ?? '') };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'MCP test failed' });
		}
	}
};
