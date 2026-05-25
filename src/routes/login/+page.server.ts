import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { googleAuthEnabled } from '$lib/server/auth';

function safeRedirectTo(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
	return value;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const redirectTo = safeRedirectTo(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);

	return {
		googleAuthEnabled: googleAuthEnabled(),
		redirectTo
	};
};
