# Before Deploying to External Public Users

This product currently has known authentication risks that are acceptable only while the app is used in a trusted, private, or development context.

Before deploying this product to external public users, revisit and fix the items below. They are intentionally documented without file or line references so the warning stays useful as the codebase evolves.

## Deferred Public-Launch Blockers

### Unverified password accounts can capture later Google logins

The current account-linking behavior can allow an unverified email/password account to be linked with a later Google login that uses the same email address.

For public deployment, this should be hardened so a user cannot pre-create an account for someone else's email address and later inherit that person's verified Google identity. Safer options include requiring local email verification before account linking, disabling this implicit linking behavior, or adding an explicit trusted linking flow.

### First-admin assignment is race-prone

The current first-user admin bootstrap can assign admin status based on whether any users already exist. Under concurrent public signups, more than one request may observe the system as empty and receive admin privileges.

For public deployment, admin bootstrap should use a database-backed invariant, a one-time setup token, an explicit invite/allowlist, or another atomic mechanism that cannot grant admin access to multiple public signups by race.

## Current Decision

These issues are not being fixed right now. Keep them visible as release blockers for any external public launch.
