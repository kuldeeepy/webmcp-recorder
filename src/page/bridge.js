// Talks to the content script over window.postMessage.
import { Channel } from "../shared/messages.js";

export const toContent = (type, data) => window.postMessage({ source: Channel.PAGE, type, data }, location.origin);

export function onContentMessage(handler) {
  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.source === Channel.CONTENT) handler(event.data.type, event.data.data);
  });
}
