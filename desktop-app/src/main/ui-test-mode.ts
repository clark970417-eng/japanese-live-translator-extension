import { app } from 'electron'
/** Development-only UI tests must not take focus, bind shortcuts or replace the user's native socket. */
export const isUiTest = !app.isPackaged && process.env.JTL_UI_TEST === '1'
