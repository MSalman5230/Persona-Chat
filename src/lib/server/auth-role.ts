export type AuthRole = 'admin' | 'user';

export function roleForNewUser(existingUserCount: number): AuthRole {
	return existingUserCount === 0 ? 'admin' : 'user';
}

export function isAdminRole(role: string | null | undefined): boolean {
	return (role ?? '')
		.split(',')
		.map((item) => item.trim())
		.includes('admin');
}
