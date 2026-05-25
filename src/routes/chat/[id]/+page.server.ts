import type { PageServerLoad } from './$types';

import { requireUser } from '$lib/server/auth/guards';
import { loadChatPageData } from '$lib/server/chat/page-data';

export const load: PageServerLoad = async ({ locals, params }) =>
	loadChatPageData(requireUser(locals).id, params.id);
