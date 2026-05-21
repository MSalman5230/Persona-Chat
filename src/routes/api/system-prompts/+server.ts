import { error, json, type RequestHandler } from '@sveltejs/kit';

import { apiErrorMessage, readJsonRequest } from '$lib/server/api';
import {
	createSystemPromptPreset,
	listSystemPromptPresets
} from '$lib/server/repositories/system-prompts';
import type { SystemPromptPresetCreateInput } from '$lib/server/repositories/system-prompts';

export const GET: RequestHandler = async () => {
	return json({ systemPrompts: await listSystemPromptPresets() });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const preset = await createSystemPromptPreset(
			(await readJsonRequest(
				request,
				'Unable to save system prompt preset'
			)) as SystemPromptPresetCreateInput
		);
		return json({ preset }, { status: 201 });
	} catch (cause) {
		error(400, apiErrorMessage(cause, 'Unable to save system prompt preset'));
	}
};
