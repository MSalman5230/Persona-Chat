import { describe, expect, it } from 'vitest';

import {
	PREBUILT_GENERAL_AGENT_ID,
	PREBUILT_GENERAL_AGENT_SLUG,
	agentIdForClient,
	isPrebuiltGeneralAgentId,
	normalizePrebuiltGeneralAgentId
} from './prebuilt-general-agent';

describe('Prebuilt General Agent metadata', () => {
	it('uses stable client and storage identifiers', () => {
		expect(PREBUILT_GENERAL_AGENT_ID).toBe('00000000-0000-4000-8000-000000000000');
		expect(PREBUILT_GENERAL_AGENT_SLUG).toBe('general-agent-alfred');
		expect(isPrebuiltGeneralAgentId(PREBUILT_GENERAL_AGENT_ID)).toBe(true);
		expect(normalizePrebuiltGeneralAgentId(PREBUILT_GENERAL_AGENT_ID)).toBeNull();
		expect(normalizePrebuiltGeneralAgentId(null)).toBeNull();
		expect(agentIdForClient(null)).toBe(PREBUILT_GENERAL_AGENT_ID);
	});
});
