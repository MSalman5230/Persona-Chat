import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { currentDateTimeTool } from './currentDateTime';

export const appTools: ToolDefinition[] = [currentDateTimeTool];

export function getAppToolNames(): string[] {
	return appTools.map((tool) => tool.name);
}
