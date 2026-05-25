import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { isGoogleAuthConfigured } from '$lib/server/auth';
import { safeRedirectPath } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals, url }) => {
	const redirectTo = safeRedirectPath(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);

	return {
		redirectTo,
		googleAuthEnabled: isGoogleAuthConfigured()
	};
};
