export const IPC = {
  // Main → Renderer
  TABLE_STATE_UPDATE: 'table:state-update',
  TABLE_HAND_COMPLETE: 'table:hand-complete',
  TABLE_ERROR: 'table:error',
  TABLE_INIT: 'table:init',
  SOUND_TRIGGER: 'sound:trigger',
  PREFLOP_FEEDBACK: 'preflop:feedback',
  POSTFLOP_FEEDBACK: 'postflop:feedback',
  ZOOM_REDIRECT: 'zoom:redirect',
  ZOOM_FOLD_EARLY: 'zoom:fold-early',

  // Renderer → Main
  PLAYER_ACTION: 'player:action',
  TABLE_READY: 'table:ready',
  FOCUS_WINDOW: 'window:focus',
  START_SESSION: 'session:start',
  STOP_SESSION: 'session:stop',
  START_SPOT_SESSION: 'spot:start-session',
  UPDATE_SETTINGS: 'settings:update',
  GET_SETTINGS: 'settings:get',
  GET_SESSION_STATS: 'session:get-stats',
  GET_SPOT_CATALOG: 'spot:get-catalog',   // invoke (request/response)

  // Dialog
  SELECT_DIRECTORY: 'dialog:select-directory',
  SELECT_FILE: 'dialog:select-file'
} as const;

export type IPCChannel = (typeof IPC)[keyof typeof IPC];
