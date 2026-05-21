import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import {
	createSystemPromptPreset,
	listSystemPromptPresets
} from '$lib/server/repositories/system-prompts';

function errorMessage(value: unknown, fallback: string): string {
	if (value instanceof z.ZodError) return value.issues[0]?.message ?? fallback;
	return value instanceof Error ? value.message : fallback;
}

export const GET: RequestHandler = async () => {
	return json({ systemPrompts: await listSystemPromptPresets() });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const preset = await createSystemPromptPreset(await request.json());
		return json({ preset }, { status: 201 });
	} catch (cause) {
		error(400, errorMessage(cause, 'Unable to save system prompt preset'));
	}
};
