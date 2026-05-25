import { error, json, type RequestHandler } from '@sveltejs/kit';

import { apiErrorMessage, readJsonRequest } from '$lib/server/api';
import {
	createCustomInstructionPreset,
	listCustomInstructionPresets
} from '$lib/server/repositories/custom-instructions';
import type { CustomInstructionPresetCreateInput } from '$lib/server/repositories/custom-instructions';

export const GET: RequestHandler = async () => {
	return json({ customInstructions: await listCustomInstructionPresets() });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const preset = await createCustomInstructionPreset(
			(await readJsonRequest(
				request,
				'Unable to save custom instruction preset'
			)) as CustomInstructionPresetCreateInput
		);
		return json({ preset }, { status: 201 });
	} catch (cause) {
		error(400, apiErrorMessage(cause, 'Unable to save custom instruction preset'));
	}
};
