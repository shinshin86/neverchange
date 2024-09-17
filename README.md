# NeverChange

![Project logo](./images/logo.png)

NeverChange is a database solution for web applications using SQLite WASM and OPFS.

## ⚠Alpha Version Warning

**This package is currently in alpha stage. The interface and method names may change with each update. Please use with caution.**

## Install

```
npm install neverchange
```

## Support Browser

* Google Chrome

This project currently supports and is tested on `Google Chrome` only.  
We use `Playwright` for our end-to-end (E2E) tests, which are configured to run exclusively on `Chrome`.

## Requirements

- Node.js (version 20 or higher recommended)
- npm (usually comes with Node.js)

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/shinshin86/neverchange.git
   cd neverchange
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Available Scripts

- `npm run build`: Build the project.
- `npm run dev:e2e`: Start the development server for E2E tests.
- `npm run e2e`: Run E2E tests using Playwright.

## Main Dependencies

- [@sqlite.org/sqlite-wasm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm): SQLite WASM implementation
- [Vite](https://vitejs.dev/): Fast frontend build tool
- [TypeScript](https://www.typescriptlang.org/): Typed superset of JavaScript
- [Playwright](https://playwright.dev/): Modern web testing and automation framework

## Development
Run E2E tests:

```
npm run e2e
```

Code Format:

```
npm run fmt
```

## License

This project is released under the [MIT License](LICENSE).