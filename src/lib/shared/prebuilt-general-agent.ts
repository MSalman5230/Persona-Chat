export const PREBUILT_GENERAL_AGENT_ID = '00000000-0000-4000-8000-000000000000';
export const PREBUILT_GENERAL_AGENT_SLUG = 'general-agent-alfred';

export function isPrebuiltGeneralAgentId(id: string | null | undefined): boolean {
	return id === PREBUILT_GENERAL_AGENT_ID;
}

export function normalizePrebuiltGeneralAgentId(id: string | null | undefined): string | null {
	return id && !isPrebuiltGeneralAgentId(id) ? id : null;
}

export function agentIdForClient(id: string | null | undefined): string {
	return id ?? PREBUILT_GENERAL_AGENT_ID;
}
