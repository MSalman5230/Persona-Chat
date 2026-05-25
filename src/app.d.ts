// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
type AuthUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

type AuthSession = {
	id: string;
	userId: string;
	token: string;
	expiresAt: Date;
	ipAddress?: string | null;
	userAgent?: string | null;
	impersonatedBy?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: AuthSession | null;
			user: AuthUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
