import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { hasAdminAccess, redirectToLogin } from '$lib/server/auth/guards';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_PAGE_PATHS = new Set(['/login']);
const ADMIN_PATH_PREFIXES = ['/admin-settings', '/api/providers', '/api/mcp-servers'];

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PAGE_PATHS.has(pathname);
}

function isAdminPath(pathname: string): boolean {
	return ADMIN_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

function isApiPath(pathname: string): boolean {
	return pathname.startsWith('/api/');
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	const authPath = isAuthPath(event.url.toString(), auth.options);
	const currentSession = await auth.api
		.getSession({ headers: event.request.headers })
		.catch(() => null);

	if (currentSession) {
		event.locals.session = currentSession.session;
		event.locals.user = currentSession.user;
	}

	if (!authPath && !isPublicPath(event.url.pathname)) {
		if (!event.locals.user) {
			if (isApiPath(event.url.pathname)) return jsonError(401, 'Authentication required');
			redirectToLogin(event.url.pathname, event.url.search);
		}

		if (isAdminPath(event.url.pathname) && !(await hasAdminAccess(event.locals.user.id))) {
			if (isApiPath(event.url.pathname)) return jsonError(403, 'Admin access required');
			return Response.redirect(new URL('/', event.url), 303);
		}
	}

	return svelteKitHandler({ auth, event, resolve, building });
};
