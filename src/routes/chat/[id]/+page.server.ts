import type { PageServerLoad } from './$types';

import { loadChatPageData } from '$lib/server/chat/page-data';

export const load: PageServerLoad = async ({ params }) => loadChatPageData(params.id);
