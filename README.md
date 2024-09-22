# NeverChange

[![CI](https://github.com/shinshin86/neverchange/actions/workflows/ci.yml/badge.svg)](https://github.com/shinshin86/neverchange/actions/workflows/ci.yml)

![Project logo](./images/logo.png)

NeverChange is a database solution for web applications using SQLite WASM and OPFS.

## ⚠ Alpha Version Warning

**This package is currently in alpha stage. The interface and method names may change with each update. Please use with caution.**

## Table of Contents

- [For Users](#for-users)
  - [Installation](#installation)
  - [Supported Browsers](#supported-browsers)
  - [Requirements](#requirements)
  - [Usage](#usage)
    - [Dump and Import Features](#dump-and-import-features)
    - [Examples](#examples)
- [For Developers](#for-developers)
  - [Setup](#setup)
  - [Available Scripts](#available-scripts)
  - [Main Dependencies](#main-dependencies)
  - [Development](#development)
- [License](#license)

## For Users

### Installation

```
npm install neverchange
```

### Supported Browsers

This project currently supports and is tested on `Google Chrome` only.  
We use `Playwright` for our end-to-end (E2E) tests, which are configured to run exclusively on `Chrome`.

All tests are tested only through Playwright.

* Google Chrome
* Microsoft Edge
* Firefox
* Safari

### Requirements

- Node.js (version 20 or higher recommended)
- npm (usually comes with Node.js)

### Usage

#### Dump and Import Features

NeverChangeDB offers two modes for database dump and import: Optimized Mode and SQLite Compatibility Mode.

##### Optimized Mode (Default)

In the optimized mode, the dump output does not include transaction control statements or PRAGMA settings. This mode is designed for:

- Flexibility: Allows for custom transaction control during import.
- Consistency: Ensures the entire import process is wrapped in a single transaction.
- Error Handling: Facilitates easy rollback in case of import errors.
- Performance: Enables fine-tuned control over transaction size and checkpoints for large datasets.
- Platform Independence: Improves compatibility between different SQLite implementations.

##### SQLite Compatibility Mode

This mode generates dump output that closely resembles the standard SQLite `.dump` command, including transaction control statements and PRAGMA settings. Use this mode when:

- Compatibility with standard SQLite tools is required.
- You need to use the dump with other systems expecting standard SQLite dump format.

#### Examples

```typescript
// Dumping a Database
const db = new NeverChangeDB('myDatabase');
await db.init();

// Optimized Mode (default)
const optimizedDump = await db.dumpDatabase();

// SQLite Compatibility Mode
const compatibleDump = await db.dumpDatabase({ compatibilityMode: true });

// Importing a Database
// Optimized Mode (default)
await db.importDump(dumpContent);

// SQLite Compatibility Mode
await db.importDump(dumpContent, { compatibilityMode: true });
```

## For Developers

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/shinshin86/neverchange.git
   cd neverchange
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Install browsers for Playwright for e2e test:
   ```
   npx playwright install
   ```

### Available Scripts

- `npm run build`: Build the project.
- `npm run dev:e2e`: Start the development server for E2E tests.
- `npm run e2e`: Run E2E tests using Playwright.

### Main Dependencies

- [@sqlite.org/sqlite-wasm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm): SQLite WASM implementation
- [Vite](https://vitejs.dev/): Fast frontend build tool
- [TypeScript](https://www.typescriptlang.org/): Typed superset of JavaScript
- [Playwright](https://playwright.dev/): Modern web testing and automation framework

### Development

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