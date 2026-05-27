import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { currentDateTimeTool } from './currentDateTime';
import { sandboxRunCodeTool } from './sandboxRunCode';

export const appTools: ToolDefinition[] = [currentDateTimeTool, sandboxRunCodeTool];
