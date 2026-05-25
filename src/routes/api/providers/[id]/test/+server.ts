import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAdmin } from '$lib/server/auth/guards';
import { createProviderRuntime } from '$lib/server/providers/runtime';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	await requireAdmin(locals);
	const body = (await request.json().catch(() => ({}))) as { modelId?: string; thinkingLevel?: string };
	const runtime = await createProviderRuntime({
		providerConnectionId: params.id,
		modelId: body.modelId,
		thinkingLevel: body.thinkingLevel
	});

	return json({
		ok: true,
		providerId: runtime.row.providerId,
		modelId: runtime.model.id,
		thinkingLevel: runtime.thinkingLevel
	});
};
