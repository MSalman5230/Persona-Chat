import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { parseJsonRequest } from '$lib/server/api';
import { requireAdmin } from '$lib/server/auth-guard';
import {
	deleteProviderConnection,
	getProviderConnection,
	providerUpdateSchema,
	updateProviderConnection
} from '$lib/server/repositories/providers';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const { params } = event;
	const provider = await getProviderConnection(params.id);
	if (!provider) error(404, 'Provider connection not found');
	const { secret: _secret, ...publicProvider } = provider;
	return json({ provider: publicProvider });
};

export const PATCH: RequestHandler = async (event) => {
	const user = requireAdmin(event);
	const { params, request } = event;
	const body = await parseJsonRequest(request, providerUpdateSchema, 'Invalid provider connection update');
	const provider = await updateProviderConnection(params.id, body, { userId: user.id });
	return json({ provider });
};

export const DELETE: RequestHandler = async (event) => {
	requireAdmin(event);
	const { params } = event;
	await deleteProviderConnection(params.id);
	return json({ ok: true });
};
