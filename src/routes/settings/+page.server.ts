import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { requireUser } from '$lib/server/auth/guards';
import { stringFromForm } from '$lib/server/forms';
import {
	getEffectiveUserSettings,
	saveUserProviderPreference,
	saveUserSettings
} from '$lib/server/repositories/user-settings';
import { isThinkingLevel, THINKING_LEVELS } from '$lib/shared/thinking';

function stringsFromForm(form: FormData, key: string): string[] {
	return form.getAll(key).filter((value): value is string => typeof value === 'string');
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);

	try {
		return {
			...(await getEffectiveUserSettings(user.id)),
			thinkingLevels: THINKING_LEVELS,
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			defaultProviderId: null,
			defaultModel: null,
			defaultThinkingLevel: null,
			thinkingLevels: THINKING_LEVELS,
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		const user = requireUser(locals);

		try {
			const form = await request.formData();
			const defaultThinkingLevel = stringFromForm(form, 'defaultThinkingLevel');

			await saveUserSettings(user.id, {
				defaultProviderConnectionId: stringFromForm(form, 'defaultProviderConnectionId'),
				defaultThinkingLevel: isThinkingLevel(defaultThinkingLevel) ? defaultThinkingLevel : null
			});

			for (const providerId of stringsFromForm(form, 'providerId')) {
				await saveUserProviderPreference(user.id, providerId, {
					defaultModel: stringFromForm(form, `defaultModel:${providerId}`),
					favoriteModels: stringsFromForm(form, `favoriteModels:${providerId}`)
				});
			}

			return { ok: true, message: 'Settings saved' };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Unable to save settings' });
		}
	}
};
