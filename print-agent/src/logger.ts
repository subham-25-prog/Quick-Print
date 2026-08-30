export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] \x1b[36m[INFO]\x1b[0m ${msg}`, ...args);
  },
  success: (msg: string, ...args: unknown[]) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] \x1b[32m[SUCCESS]\x1b[0m ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    const time = new Date().toLocaleTimeString();
    console.warn(`[${time}] \x1b[33m[WARN]\x1b[0m ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    const time = new Date().toLocaleTimeString();
    console.error(`[${time}] \x1b[31m[ERROR]\x1b[0m ${msg}`, ...args);
  },
  job: (orderNumber: string, msg: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] \x1b[35m[JOB:${orderNumber}]\x1b[0m ${msg}`);
  },
};
