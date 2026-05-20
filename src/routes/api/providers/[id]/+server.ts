import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
	deleteProviderConnection,
	getProviderConnection,
	updateProviderConnection
} from '$lib/server/repositories/providers';

export const GET: RequestHandler = async ({ params }) => {
	const provider = await getProviderConnection(params.id);
	if (!provider) error(404, 'Provider connection not found');
	const { secret: _secret, ...publicProvider } = provider;
	return json({ provider: publicProvider });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const provider = await updateProviderConnection(params.id, await request.json());
	return json({ provider });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteProviderConnection(params.id);
	return json({ ok: true });
};
