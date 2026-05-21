import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { currentDateTimeTool } from './currentDateTime';

export const appTools: ToolDefinition[] = [currentDateTimeTool];
