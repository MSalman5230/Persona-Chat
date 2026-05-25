import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';
import { userHasAdminPermission } from '$lib/server/auth-permissions';

const PUBLIC_PAGE_PATHS = new Set(['/login', '/signup']);

function isPublicPage(pathname: string): boolean {
	return PUBLIC_PAGE_PATHS.has(pathname);
}

function isApiPath(pathname: string): boolean {
	return pathname.startsWith('/api/');
}

function unauthorizedApiResponse(): Response {
	return new Response(JSON.stringify({ message: 'Authentication required' }), {
		status: 401,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = null;
	event.locals.user = null;
	event.locals.isAdmin = false;

	const authPath = isAuthPath(event.url.toString(), auth.options);
	if (!building) {
		const session = await auth.api
			.getSession({
				headers: event.request.headers
			})
			.catch(() => null);

		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
			event.locals.isAdmin = await userHasAdminPermission(session.user.role);
		}
	}

	if (!building && !authPath && !isPublicPage(event.url.pathname) && !event.locals.user) {
		if (isApiPath(event.url.pathname)) return unauthorizedApiResponse();

		const loginUrl = new URL('/login', event.url);
		loginUrl.searchParams.set('redirectTo', `${event.url.pathname}${event.url.search}`);
		redirect(303, loginUrl);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
