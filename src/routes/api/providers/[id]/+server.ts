import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { readJsonRequest, rethrowValidationAsBadRequest } from '$lib/server/api';
import { requireAdmin } from '$lib/server/auth/guards';
import {
	deleteProviderConnection,
	getProviderConnection,
	updateProviderConnection
} from '$lib/server/repositories/providers';
import type { ProviderUpdateInput } from '$lib/server/repositories/providers';

export const GET: RequestHandler = async ({ locals, params }) => {
	await requireAdmin(locals);
	const provider = await getProviderConnection(params.id);
	if (!provider) error(404, 'Provider connection not found');
	const { secret: _secret, ...publicProvider } = provider;
	return json({ provider: publicProvider });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	await requireAdmin(locals);
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

export const DELETE: RequestHandler = async ({ locals, params }) => {
	await requireAdmin(locals);
	await deleteProviderConnection(params.id);
	return json({ ok: true });
};
