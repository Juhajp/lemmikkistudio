// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  output: 'server', // TÄMÄ ON KRIITTINEN
  adapter: vercel(),
  integrations: [tailwind(), react()],
});