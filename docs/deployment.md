# Deployment Documentation

This document provides detailed instructions for deploying NeverChange on GitHub Pages and Netlify. Follow the steps below to set up your deployment.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Netlify (Recommendation)](#netlify-recommendation)
 - [When using Vite on Netlify](#when-using-vite-on-netlify)
- [GitHub Pages](#github-pages)
  - [When using Vite on GitHub Pages](#when-using-vite-on-github-pages)

## Prerequisites

To enable `OPFS` and `SharedArrayBuffer` (which is used internally by `SQLite Wasm`), you need to add two specific headers to your site’s server configuration:

* Cross-Origin-Opener-Policy: same-origin
* Cross-Origin-Embedder-Policy: require-corp

These headers allow your site to use certain advanced features necessary for NeverChange to work properly.

## Netlify (Recommendation)
Netlify is recommended for easy setup and compatibility with Safari on iPhone.

Place the `_headers` file in the root directory of your deployment destination, with the following configuration:

```
/*  
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### When using Vite on Netlify

Also, if you use Vite during development, remember to put the following in `vite.config.{ts|js}`.

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
```

## GitHub Pages
If you use GitHub Pages, you cannot use OPFS because you cannot set the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers.

Therefore, you must use [coi-serviceworker.js](https://github.com/gzuidhof/coi-serviceworker) on GitHub Pages, but note that it doesn’t fully support Safari.

You can load and use it in HTML as shown below.

```html
<!DOCTYPE html>
<html>
<head>
  <title>NeverChange Example</title>
  <!-- coi-serviceworker.js is required for GitHub Pages -->
  <script src="/your-project-name/coi-serviceworker.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

### When using Vite on GitHub Pages

If you are building your app using Vite for GitHub Pages, you may want to prepare a configuration file (`vite.config.{ts|js}`) similar to this:

```typescript
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// This htmlPlugin automatically injects the coi-serviceworker.js script into the HTML <head>.
// This helps avoid cross-origin issues and enables the COOP and COEP headers required for OPFS.
const htmlPlugin = (): Plugin => {
  return {
    name: 'html-transform',
    transformIndexHtml(html: string) {
      return html.replace(
        '</title>',
        `</title>\n    <script src="/your-project-name/coi-serviceworker.js"></script>`,
      );
    },
  };
};

export default defineConfig({
  base: '/your-project-name/',
  plugins: [react(), htmlPlugin()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
```