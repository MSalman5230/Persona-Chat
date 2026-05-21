import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { apiErrorMessage, readJsonRequest } from '$lib/server/api';
import {
	deleteSystemPromptPreset,
	updateSystemPromptPresetDefault
} from '$lib/server/repositories/system-prompts';
import type { SystemPromptPresetPatchInput } from '$lib/server/repositories/system-prompts';

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const preset = await updateSystemPromptPresetDefault(
			params.id,
			(await readJsonRequest(
				request,
				'Unable to update system prompt preset'
			)) as SystemPromptPresetPatchInput
		);
		return json({ preset });
	} catch (cause) {
		error(400, apiErrorMessage(cause, 'Unable to update system prompt preset'));
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteSystemPromptPreset(params.id);
	return json({ ok: true });
};
