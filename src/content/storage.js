// Per-site storage on the user's own disk (chrome.storage.local). Nothing leaves the browser.

const tasksKey = (host) => `tasks:${host}`;
const sessionKey = (host) => `session:${host}`;
const runsKey = (host) => `runs:${host}`;
export const emptySession = () => ({ active: false, interactions: [], requests: [] });

export async function loadSite(host) {
  const stored = await chrome.storage.local.get([tasksKey(host), sessionKey(host), runsKey(host)]);
  return { tasks: stored[tasksKey(host)] || [], session: stored[sessionKey(host)] || emptySession(), runs: stored[runsKey(host)] || {} };
}

export const saveTasks = (host, tasks) => chrome.storage.local.set({ [tasksKey(host)]: tasks });

// The recording session is stored too, so it survives pages that reload when a form is submitted.
export const saveSession = (host, session) => chrome.storage.local.set({ [sessionKey(host)]: session });

// Last run of each task: { [taskId]: { at, ok, message } }.
export const saveRuns = (host, runs) => chrome.storage.local.set({ [runsKey(host)]: runs });
