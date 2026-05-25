import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { parseJsonRequest } from '$lib/server/api';
import { requireAdmin, requireUser } from '$lib/server/auth-guard';
import { findSupportedProvider } from '$lib/server/providers/catalog';
import {
	createProviderConnection,
	listProviderConnections
} from '$lib/server/repositories/providers';
import { THINKING_LEVELS } from '$lib/shared/thinking';

const providerSchema = z.object({
	name: z.string().min(1),
	providerId: z.string().min(1),
	api: z.string().default('openai'),
	baseUrl: z.string().url().optional().nullable(),
	defaultModel: z.string().min(1),
	defaultThinkingLevel: z.enum(THINKING_LEVELS).default('medium'),
	authHeader: z.boolean().default(true),
	models: z.array(z.string()).default([]),
	favoriteModels: z.array(z.string()).default([]),
	config: z.record(z.string(), z.unknown()).default({}),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(true),
	isDefault: z.boolean().default(false)
});

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	return json({
		providers: await listProviderConnections({
			userId: user.id,
			enabledOnly: !event.locals.isAdmin
		})
	});
};

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const { request } = event;
	const body = await parseJsonRequest(request, providerSchema, 'Invalid provider connection');
	if ((body.baseUrl || !findSupportedProvider(body.providerId)) && !body.apiKey) {
		error(400, 'API key is required for custom providers');
	}
	const provider = await createProviderConnection(body);
	return json({ provider }, { status: 201 });
};
