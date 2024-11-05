# Deployment Guide (GitHub Pages and Netlify)

This document provides detailed instructions for deploying NeverChange on GitHub Pages and Netlify. Follow the steps below to set up your deployment.

## Table of Contents
- [Prerequisites](#prerequisites)
- [When using Vite on GitHub Pages](#when-using-vite-on-github-pages)
- [When using Vite on Netlify](#when-using-vite-on-netlify)

## Prerequisites

Both GitHub Pages and Netlify require the use of [coi-serviceworker.js](https://github.com/gzuidhof/coi-serviceworker).

When using GitHub Pages, OPFS is unavailable because you cannot set the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers.

The `coi-serviceworker` helps work around this limitation.

However, this service worker mechanism does not function correctly in Safari, making Safari incompatible with these environments.

You can load and use it in HTML as shown below:

```html
<!DOCTYPE html>
<html>
<head>
  <title>NeverChange Example</title>
  <!-- coi-serviceworker.js is required for GitHub Pages or Netlify hosting -->
  <script src="/coi-serviceworker.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

## When using Vite on GitHub Pages
If you are building a site with Vite + React on GitHub Pages, use the following configuration to ensure compatibility with OPFS.

```typescript
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// This htmlPlugin configuration is tailored for GitHub Pages. It automatically injects the coi-serviceworker.js script into the HTML <head> during build time.
// It's useful for ensuring that the necessary service worker is included without manually editing the HTML file.
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


## When using Vite on Netlify
If you are building a site with Vite + React on Netlify, use the following configuration to ensure compatibility with OPFS.

This setup is similar to the GitHub Pages method, but on Netlify, you don’t need to specify the `base: '/your-project-name/'` option, as Netlify’s URLs are typically in the format `http(s)://<project-name>.netlify.app/`, and a base path isn’t required. 

Note that `htmlPlugin` also differs slightly for the same reason, so please take note of this difference.

```typescript
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// This htmlPlugin configuration is tailored for Netlify. It automatically injects the coi-serviceworker.js script into the HTML <head> during build time.
// It's useful for ensuring that the necessary service worker is included without manually editing the HTML file.
// This helps avoid cross-origin issues and enables the COOP and COEP headers required for OPFS.
const htmlPlugin = (): Plugin => {
  return {
    name: 'html-transform',
    transformIndexHtml(html: string) {
      return html.replace(
        '</title>',
        `</title>\n    <script src="/coi-serviceworker.js"></script>`,
      );
    },
  };
};

export default defineConfig({
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