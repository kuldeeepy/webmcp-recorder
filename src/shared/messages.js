// Message types between the side panel, content script, page script and service worker.
export const Msg = Object.freeze({
  GET_STATE: "wmr/get-state",
  START_RECORDING: "wmr/start-recording",
  STOP_RECORDING: "wmr/stop-recording",
  CANCEL_RECORDING: "wmr/cancel-recording",
  DRAFT_FROM_REQUEST: "wmr/draft-from-request",
  SAVE_TASK: "wmr/save-task",
  DELETE_TASK: "wmr/delete-task",
  IMPORT_TASKS: "wmr/import-tasks",
  RUN_TASK: "wmr/run-task",
  RUN_ON_PAGE: "wmr/run-on-page",
  RUN_PROGRESS: "wmr/run-progress",
  RECORD_RUN: "wmr/record-run",
  CANCEL_FIX: "wmr/cancel-fix",
  STATE_CHANGED: "wmr/state-changed",
  SET_BADGE: "wmr/set-badge",
});

// window.postMessage channel between the page script (MAIN world) and the content script.
export const Channel = Object.freeze({ PAGE: "wmr-page", CONTENT: "wmr-content" });

export const PageMsg = Object.freeze({
  SET_CAPTURING: "set-capturing",
  SET_TASKS: "set-tasks",
  RUN: "run",
  RUN_RESULT: "run-result",
  RUN_STEPS: "run-steps",
  STEPS_RESULT: "steps-result",
  REQUEST: "request",
  INTERACTION: "interaction",
});
