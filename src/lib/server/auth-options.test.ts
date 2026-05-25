import { describe, expect, it } from 'vitest';

import { googleAccountLinking, googleProfileSync } from './auth-options';

describe('auth account linking options', () => {
	it('allows Google to link same-email email/password accounts without local email verification', () => {
		expect(googleAccountLinking.enabled).toBe(true);
		expect(googleAccountLinking.trustedProviders).toContain('google');
		expect(googleAccountLinking.requireLocalEmailVerified).toBe(false);
		expect(googleAccountLinking.updateUserInfoOnLink).toBe(true);
		expect('allowDifferentEmails' in googleAccountLinking).toBe(false);
	});

	it('syncs Google profile details into the user row during Google sign-in', () => {
		expect(googleProfileSync.overrideUserInfoOnSignIn).toBe(true);
	});
});
