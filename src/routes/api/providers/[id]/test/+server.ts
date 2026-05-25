import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { adminAccess } from '$lib/server/resource-policy';
import { createProviderRuntime } from '$lib/server/providers/runtime';

export const POST: RequestHandler = async (event) => {
	adminAccess(event);
	const { params, request } = event;
	const body = (await request.json().catch(() => ({}))) as { modelId?: string; thinkingLevel?: string };
	const runtime = await createProviderRuntime({
		providerConnectionId: params.id,
		modelId: body.modelId,
		thinkingLevel: body.thinkingLevel
	});

	return json({
		ok: true,
		providerId: runtime.provider.providerId,
		modelId: runtime.model.id,
		thinkingLevel: runtime.thinkingLevel
	});
};
