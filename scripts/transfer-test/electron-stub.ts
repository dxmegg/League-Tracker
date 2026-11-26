// What the database code reaches for in Electron, when the transfer test runs it as plain Node
export const app = { isPackaged: true, getPath: () => process.env.RR_TEST_DIR as string };
