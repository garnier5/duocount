import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#F4EFE6' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#F4EFE6' } }
  },
  images: ['public/logo.svg']
});
