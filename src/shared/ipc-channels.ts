export const IPC = {
  // Main → Renderer
  TABLE_STATE_UPDATE: 'table:state-update',
  TABLE_HAND_COMPLETE: 'table:hand-complete',
  TABLE_ERROR: 'table:error',
  TABLE_INIT: 'table:init',
  SOUND_TRIGGER: 'sound:trigger',

  // Renderer → Main
  PLAYER_ACTION: 'player:action',
  TABLE_READY: 'table:ready',
  START_SESSION: 'session:start',
  STOP_SESSION: 'session:stop',
  UPDATE_SETTINGS: 'settings:update',
  GET_SESSION_STATS: 'session:get-stats',

  // Dialog
  SELECT_DIRECTORY: 'dialog:select-directory',
  SELECT_FILE: 'dialog:select-file'
} as const;

export type IPCChannel = (typeof IPC)[keyof typeof IPC];
