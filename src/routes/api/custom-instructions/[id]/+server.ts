import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { apiErrorMessage, readJsonRequest } from '$lib/server/api';
import {
	deleteCustomInstructionPreset,
	updateCustomInstructionPresetDefault
} from '$lib/server/repositories/custom-instructions';
import type { CustomInstructionPresetPatchInput } from '$lib/server/repositories/custom-instructions';

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const preset = await updateCustomInstructionPresetDefault(
			params.id,
			(await readJsonRequest(
				request,
				'Unable to update custom instruction preset'
			)) as CustomInstructionPresetPatchInput
		);
		return json({ preset });
	} catch (cause) {
		error(400, apiErrorMessage(cause, 'Unable to update custom instruction preset'));
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteCustomInstructionPreset(params.id);
	return json({ ok: true });
};
