import type { AuthSession, AuthUser } from '$lib/server/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: AuthSession | null;
			user: AuthUser | null;
			isAdmin: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
