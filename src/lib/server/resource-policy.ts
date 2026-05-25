import type { RequestEvent } from '@sveltejs/kit';

import { authenticatedUser, requireAdmin } from '$lib/server/auth-guard';

export type ResourceFilter = {
	enabledOnly: boolean;
};

export type AccessPolicy = {
	userId: string;
	isAdmin: boolean;
	resources: {
		management: ResourceFilter;
		runtime: ResourceFilter;
	};
};

function resourceFilters(isAdmin: boolean): AccessPolicy['resources'] {
	return {
		management: { enabledOnly: !isAdmin },
		runtime: { enabledOnly: true }
	};
}

export function buildAccessPolicy(userId: string, isAdmin: boolean): AccessPolicy {
	return {
		userId,
		isAdmin,
		resources: resourceFilters(isAdmin)
	};
}

export function authenticatedAccess(event: RequestEvent): AccessPolicy {
	const user = authenticatedUser(event);
	return buildAccessPolicy(user.id, event.locals.isAdmin);
}

export function adminAccess(event: RequestEvent): AccessPolicy {
	const user = requireAdmin(event);
	return buildAccessPolicy(user.id, true);
}

export function runtimeResourceFilter(): ResourceFilter {
	return { enabledOnly: true };
}
