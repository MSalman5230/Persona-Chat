import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import {
	createProviderConnection,
	listProviderConnections
} from '$lib/server/repositories/providers';

const providerSchema = z.object({
	name: z.string().min(1),
	providerId: z.string().min(1),
	kind: z.enum(['built_in', 'custom']).default('built_in'),
	api: z.string().default('openai'),
	baseUrl: z.string().url().optional().nullable(),
	defaultModel: z.string().min(1),
	defaultThinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('medium'),
	authHeader: z.boolean().default(true),
	models: z.array(z.string()).default([]),
	config: z.record(z.string(), z.unknown()).default({}),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(true),
	isDefault: z.boolean().default(false)
});

export const GET: RequestHandler = async () => {
	return json({ providers: await listProviderConnections() });
};

export const POST: RequestHandler = async ({ request }) => {
	const provider = await createProviderConnection(providerSchema.parse(await request.json()));
	return json({ provider }, { status: 201 });
};
