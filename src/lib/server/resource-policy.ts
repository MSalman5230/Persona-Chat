import type { RequestEvent } from '@sveltejs/kit';

import { authenticatedUser, requireAdmin } from '$lib/server/auth-guard';
import { isAdminRole } from '$lib/server/auth-role';

/**
 * Resource ownership model:
 * - Providers and MCP servers are global shared infrastructure.
 * - Agents, chats, and user provider preferences are user-owned.
 * Non-admin visibility uses AccessPolicy.resources filters (enabledOnly), not row-level userId.
 */

export type ResourceFilter = {
	enabledOnly: boolean;
};

export const RUNTIME_RESOURCE_FILTER: ResourceFilter = { enabledOnly: true };

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
		runtime: RUNTIME_RESOURCE_FILTER
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
	return buildAccessPolicy(user.id, isAdminRole(user.role));
}

export function adminAccess(event: RequestEvent): AccessPolicy {
	const user = requireAdmin(event);
	return buildAccessPolicy(user.id, true);
}

export function runtimeResourceFilter(): ResourceFilter {
	return RUNTIME_RESOURCE_FILTER;
}
