import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { wsHandlers } from "./ws";

export const server = setupServer(...handlers, ...wsHandlers);
