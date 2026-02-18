/**
 * IPC Channel Constants
 * Define all IPC channel names to ensure type safety and consistency
 */

export const IPC_CHANNELS = {
  // SSH Channels
  SSH: {
    CONNECT: 'ssh:connect',
    DISCONNECT: 'ssh:disconnect',
    WRITE: 'ssh:write',
    RESIZE: 'ssh:resize',
    DATA: 'ssh:data',
    CONNECTED: 'ssh:connected',
    DISCONNECTED: 'ssh:disconnected',
    ERROR: 'ssh:error',
  },
  
  // AI Channels
  AI: {
    SEND_MESSAGE: 'ai:send-message',
    SAVE_MESSAGE: 'ai:save-message',
    STREAM_CHUNK: 'ai:stream-chunk',
    STREAM_END: 'ai:stream-end',
    CANCEL: 'ai:cancel',
    ERROR: 'ai:error',
    GET_TOKENS: 'ai:get-tokens',
  },
  
  // Plan Channels
  PLAN: {
    GENERATED: 'plan:generated',
    STEP_UPDATE: 'plan:step-update',
    APPROVAL_NEEDED: 'plan:approval-needed',
    APPROVE: 'plan:approve',
    REJECT: 'plan:reject',
    PAUSE: 'plan:pause',
    RESUME: 'plan:resume',
    CANCEL: 'plan:cancel',
    COMPLETE: 'plan:complete',
  },
  
  // Connection Channels
  CONNECTION: {
    GET_ALL: 'connection:get-all',
    GET_BY_ID: 'connection:get-by-id',
    CREATE: 'connection:create',
    UPDATE: 'connection:update',
    DELETE: 'connection:delete',
    TEST: 'connection:test',
  },
  
  // Settings Channels
  SETTINGS: {
    GET: 'settings:get',
    UPDATE: 'settings:update',
    GET_API_KEY: 'settings:get-api-key',
    SET_API_KEY: 'settings:set-api-key',
  },
  
  // Session Channels
  SESSION: {
    GET: 'session:get',
    SAVE: 'session:save',
    CLEAR: 'session:clear',
  },
} as const;
