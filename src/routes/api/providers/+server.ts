import { error, json, type RequestHandler } from '@sveltejs/kit';

import { parseJsonRequest } from '$lib/server/api';
import { findSupportedProvider } from '$lib/server/providers/catalog';
import { adminAccess, authenticatedAccess } from '$lib/server/resource-policy';
import {
	createProviderConnection,
	listProviderConnections,
	providerInputSchema,
	serializeProviderConnectionForUser
} from '$lib/server/repositories/providers';

export const GET: RequestHandler = async (event) => {
	const access = authenticatedAccess(event);
	return json({
		providers: await listProviderConnections({
			userId: access.userId,
			...access.resources.management
		})
	});
};

export const POST: RequestHandler = async (event) => {
	const access = adminAccess(event);
	const { request } = event;
	const body = await parseJsonRequest(request, providerInputSchema, 'Invalid provider connection');
	if ((body.baseUrl || !findSupportedProvider(body.providerId)) && !body.apiKey) {
		error(400, 'API key is required for custom providers');
	}
	const row = await createProviderConnection(body);
	const provider = await serializeProviderConnectionForUser(row, access.userId);
	return json({ provider }, { status: 201 });
};
