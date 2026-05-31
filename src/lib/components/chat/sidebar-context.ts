import { createContext } from 'svelte';

export type AppSidebarSession = {
	id: string;
	title: string;
};

export type NewChatHandler = () => void | Promise<void>;

export type AppSidebarContext = {
	openSidebar: () => void;
	closeSidebar: () => void;
	registerNewChatHandler: (handler: NewChatHandler) => () => void;
	upsertSession: (session: AppSidebarSession) => void;
	removeSession: (sessionId: string) => void;
};

export const [getAppSidebarContext, setAppSidebarContext] =
	createContext<AppSidebarContext>();
