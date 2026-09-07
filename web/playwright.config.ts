import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,retries:process.env.CI?1:0,
  use:{baseURL:'http://localhost:3100',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'mobile-chromium',use:{...devices['Pixel 7'],defaultBrowserType:'chromium',channel:process.env.CI?undefined:'chrome'}}],
  webServer:{command:'npm run start -- --port 3100',url:'http://localhost:3100',reuseExistingServer:!process.env.CI,timeout:120000},
});
