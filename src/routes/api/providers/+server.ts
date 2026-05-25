import { error, json, type RequestHandler } from '@sveltejs/kit';

import { parseJsonRequest } from '$lib/server/api';
import { authenticatedUser, requireAdmin } from '$lib/server/auth-guard';
import { findSupportedProvider } from '$lib/server/providers/catalog';
import { managementResourceFilter } from '$lib/server/resource-policy';
import {
	createProviderConnection,
	listProviderConnections,
	providerInputSchema
} from '$lib/server/repositories/providers';

export const GET: RequestHandler = async (event) => {
	const user = authenticatedUser(event);
	return json({
		providers: await listProviderConnections({
			userId: user.id,
			...managementResourceFilter(event)
		})
	});
};

export const POST: RequestHandler = async (event) => {
	const user = requireAdmin(event);
	const { request } = event;
	const body = await parseJsonRequest(request, providerInputSchema, 'Invalid provider connection');
	if ((body.baseUrl || !findSupportedProvider(body.providerId)) && !body.apiKey) {
		error(400, 'API key is required for custom providers');
	}
	const provider = await createProviderConnection(body, { userId: user.id });
	return json({ provider }, { status: 201 });
};
