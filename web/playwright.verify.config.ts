import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, use: { ...base.use, baseURL: 'http://localhost:3116' }, webServer: { command: 'npm run start -- --port 3116', url: 'http://localhost:3116', reuseExistingServer: false, timeout: 120000 } });
