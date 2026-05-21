import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { readJsonRequest, rethrowValidationAsBadRequest } from '$lib/server/api';
import {
	deleteProviderConnection,
	getProviderConnection,
	updateProviderConnection
} from '$lib/server/repositories/providers';
import type { ProviderUpdateInput } from '$lib/server/repositories/providers';

export const GET: RequestHandler = async ({ params }) => {
	const provider = await getProviderConnection(params.id);
	if (!provider) error(404, 'Provider connection not found');
	const { secret: _secret, ...publicProvider } = provider;
	return json({ provider: publicProvider });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await readJsonRequest(
		request,
		'Invalid provider connection update'
	)) as ProviderUpdateInput;
	try {
		const provider = await updateProviderConnection(params.id, body);
		return json({ provider });
	} catch (cause) {
		rethrowValidationAsBadRequest(cause, 'Invalid provider connection update');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteProviderConnection(params.id);
	return json({ ok: true });
};
