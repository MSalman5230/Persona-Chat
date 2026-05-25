import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { parseJsonRequest } from '$lib/server/api';
import { adminAccess } from '$lib/server/resource-policy';
import {
	deleteProviderConnection,
	getProviderConnection,
	providerUpdateSchema,
	serializeProviderConnectionForUser,
	updateProviderConnection
} from '$lib/server/repositories/providers';

export const GET: RequestHandler = async (event) => {
	adminAccess(event);
	const { params } = event;
	const provider = await getProviderConnection(params.id);
	if (!provider) error(404, 'Provider connection not found');
	const { secret: _secret, ...publicProvider } = provider;
	return json({ provider: publicProvider });
};

export const PATCH: RequestHandler = async (event) => {
	const access = adminAccess(event);
	const { params, request } = event;
	const body = await parseJsonRequest(request, providerUpdateSchema, 'Invalid provider connection update');
	const row = await updateProviderConnection(params.id, body);
	const provider = await serializeProviderConnectionForUser(row, access.userId);
	return json({ provider });
};

export const DELETE: RequestHandler = async (event) => {
	adminAccess(event);
	const { params } = event;
	await deleteProviderConnection(params.id);
	return json({ ok: true });
};
