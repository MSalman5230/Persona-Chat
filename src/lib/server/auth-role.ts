import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';

export type AuthRole = 'admin' | 'user';

export const AUTH_DEFAULT_ROLE: AuthRole = 'user';
export const AUTH_ADMIN_ROLES = ['admin'] as const satisfies readonly AuthRole[];
export const AUTH_APP_ADMIN_PERMISSION = { app: ['manage'] } as {
	app: ['manage'];
};
export const AUTH_ACCESS_CONTROL = createAccessControl({
	...defaultStatements,
	app: ['manage']
} as const);
export const AUTH_ROLES = {
	admin: AUTH_ACCESS_CONTROL.newRole({
		...adminAc.statements,
		app: ['manage']
	}),
	user: AUTH_ACCESS_CONTROL.newRole({
		...userAc.statements,
		app: []
	})
} as const;

export function roleForNewUser(existingUserCount: number): AuthRole {
	return existingUserCount === 0 ? 'admin' : AUTH_DEFAULT_ROLE;
}

export function rolesFromAuthRoleString(role: string | null | undefined): string[] {
	return (role ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function isConfiguredAuthRole(role: string): role is keyof typeof AUTH_ROLES {
	return role in AUTH_ROLES;
}

export function isAdminRole(role: string | null | undefined): boolean {
	return rolesFromAuthRoleString(role).some(
		(item) =>
			isConfiguredAuthRole(item) &&
			AUTH_ROLES[item].authorize(AUTH_APP_ADMIN_PERMISSION).success === true
	);
}
