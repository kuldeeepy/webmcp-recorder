// Service worker: the toolbar icon (or Alt+Shift+R) opens the side panel; shows a task count badge.
import { Msg } from "../shared/messages.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === Msg.SET_BADGE && sender.tab?.id) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.count ? String(message.count) : "" }).catch(() => {}); // tab may have closed
  }
});
