import { defineConfig, devices } from "@playwright/test";

/** Tek HTML mobil uygulamanın testleri. Supabase istekleri test içinde taklit edilir. */
const PORT = 3310;
export default defineConfig({
  testDir: "tests/mobile-e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "off", ...devices["Pixel 7"] },
  webServer: {
    command: `node mobile/scripts/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      AMED_SUPABASE_URL: "https://mock-proj.supabase.co",
      AMED_SUPABASE_ANON_KEY: "test-anon-key-0123456789abcdefghijklmnop",
      AMED_SITE_URL: "https://site.example",
    },
  },
});
