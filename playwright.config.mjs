import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  timeout:60_000,
  expect:{timeout:15_000},
  workers:2,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  projects:[
    {name:'chromium-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',
      browserName:'chromium',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?
        {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}: {}}},
    {name:'webkit-mobile',use:{...devices['iPhone 13'],browserName:'webkit'}}
  ],
  webServer:{command:'node tests/browser/server.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI}
});
