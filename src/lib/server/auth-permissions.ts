import { auth } from '$lib/server/auth';
import { AUTH_APP_ADMIN_PERMISSION, AUTH_DEFAULT_ROLE, AUTH_ROLES } from '$lib/server/auth-role';

type AuthConfiguredRole = keyof typeof AUTH_ROLES;

export async function userHasAdminPermission(role: string | null | undefined): Promise<boolean> {
	const result = await auth.api
		.userHasPermission({
			body: {
				role: (role ?? AUTH_DEFAULT_ROLE) as AuthConfiguredRole,
				permissions: AUTH_APP_ADMIN_PERMISSION
			}
		})
		.catch(() => null);

	return result?.success === true;
}
