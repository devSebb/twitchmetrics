import { Inngest } from "inngest";
import { twitchPriorityMiddleware } from "./middleware/twitch-priority";

export const inngest = new Inngest({
  id: "twitchmetrics",
  middleware: [twitchPriorityMiddleware],
});
