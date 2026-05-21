import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import {
	deleteSystemPromptPreset,
	updateSystemPromptPresetDefault
} from '$lib/server/repositories/system-prompts';

function errorMessage(value: unknown, fallback: string): string {
	if (value instanceof z.ZodError) return value.issues[0]?.message ?? fallback;
	return value instanceof Error ? value.message : fallback;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const preset = await updateSystemPromptPresetDefault(params.id, await request.json());
		return json({ preset });
	} catch (cause) {
		error(400, errorMessage(cause, 'Unable to update system prompt preset'));
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteSystemPromptPreset(params.id);
	return json({ ok: true });
};
