# NeverChange

[![CI](https://github.com/shinshin86/neverchange/actions/workflows/ci.yml/badge.svg)](https://github.com/shinshin86/neverchange/actions/workflows/ci.yml)

![Project logo](./images/logo.png)

NeverChange is a database solution for web applications using SQLite WASM and OPFS.

## 👩‍💻 Beta Version Warning 👨‍💻

**This package is currently in beta stage. The interface and method names may change with each update. Please use with caution.**

## Table of Contents

- [Installation](#installation)
- [Supported Browsers](#supported-browsers)
- [About Application Deployment](#about-application-deployment)
  - [Netlify (Recommendation)](#netlify-recommendation)
  - [Cloudflare Pages (Recommendation)](#cloudflare-pages-recommendation)
  - [GitHub Pages](#github-pages)
- [Requirements](#requirements)
- [Usage](#usage)
  - [Basic](#basic)
  - [Migration](#migration)
  - [Dump and Import Features](#dump-and-import-features)
  - [CSV Export and Import](#csv-export-and-import)
- [For Developers](#for-developers)
  - [Setup](#setup)
  - [Available Scripts](#available-scripts)
  - [Main Dependencies](#main-dependencies)
  - [Development](#development)
- [License](#license)

## Installation

```
npm install neverchange
```

## Supported Browsers

All end-to-end tests are conducted with Playwright in Chrome, Edge, Chromium, and Firefox.

* Google Chrome
* Microsoft Edge
* Firefox
* Safari
  * (However, there are restrictions. See [About Application Deployment](#about-application-deployment) for more information.)

## About Application Deployment
Our recommendation is to deploy with Netlify for better compatibility. See below for Netlify and GitHub Pages deployment instructions.


A full deployment guide is available in the [Deployment Documentation](docs/deployment.md), including specific configuration examples.

### Netlify (Recommendation)

Netlify is recommended for deploying apps with persistent data on the web front end using NeverChange.

The following statement in the `_headers` file can be used for this purpose.

```
/*  
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### Cloudflare Pages (Recommendation)

Cloudflare Pages is recommended for deploying apps with persistent data on the web front end using NeverChange.

The following statement in the `_headers` file can be used for this purpose.

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
```

### GitHub Pages
If you want to host on GitHub Pages, you will need [coi-serviceworker.js](https://github.com/gzuidhof/coi-serviceworker).

But, Safari does not function properly in this case. Refer to the following issue for more details.  
https://github.com/shinshin86/neverchange/issues/6

example:

```html
<!DOCTYPE html>
<html>
<head>
  <title>NeverChange Example</title>
  <!-- If you want to host on GitHub, you will need coi-serviceworker.js -->
  <script src="/coi-serviceworker.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx">
</body>
</html>
```

A full deployment guide is available in the [Deployment Documentation](docs/deployment.md), including specific configuration examples.

## Requirements

- Node.js (version 20 or higher recommended)
- npm (usually comes with Node.js)

## Usage

![Usage image](./images/Usage.jpg)

Here’s how to use NeverChange with some practical examples.

If you’re interested in writing SQL efficiently with NeverChange, you may also want to check out [sqlc-gen-typescript-for-neverchange](https://github.com/shinshin86/sqlc-gen-typescript-for-neverchange), which generates TypeScript code using [sqlc](https://github.com/sqlc-dev/sqlc).

### Basic

Here's a basic example of how to use NeverChangeDB to create a database, insert data, and query it:

```typescript
import { NeverChangeDB } from 'neverchange';

async function main() {
  // Initialize the database
  const db = new NeverChangeDB('myDatabase');
  await db.init();

  // Create a table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    )
  `);

  // Insert data
  await db.execute(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    ['John Doe', 'john@example.com']
  );

  // Query data
  const users = await db.query('SELECT * FROM users');
  console.log('Users:', users);

  // Close the database connection
  await db.close();
}

main().catch(console.error);
```

### Migration

NeverChangeDB supports database migrations, allowing you to evolve your database schema over time. Here's an example of how to define and use migrations:

```typescript
import { NeverChangeDB } from 'neverchange';

// Define migrations
const migrations = [
  {
    version: 1,
    up: async (db) => {
      await db.execute(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        )
      `);
    }
  },
  {
    version: 2,
    up: async (db) => {
      await db.execute(`
        ALTER TABLE users ADD COLUMN email TEXT
      `);
    }
  }
];

async function main() {
  // Initialize the database with migrations
  const db = new NeverChangeDB('myDatabase', { isMigrationActive: true });
  db.addMigrations(migrations);
  await db.init();

  // The database will now have the latest schema
  const tableInfo = await db.query('PRAGMA table_info(users)');
  console.log('Users table schema:', tableInfo);

  await db.close();
}

main().catch(console.error);
```

### Transactions

NeverChangeDB supports transaction handling.  
When you call `db.transaction(async (tx) => { ... })`, the statements within the callback are wrapped in a transaction.  
- If the callback completes successfully, the transaction is committed automatically.  
- If an error occurs or if you explicitly call `tx.rollback()`, the transaction is rolled back.

#### Basic Example

```ts
import { NeverChangeDB } from 'neverchange';

async function main() {
  const db = new NeverChangeDB('myDatabase');
  await db.init();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance INTEGER NOT NULL
    )
  `);

  // Perform multiple operations in a single transaction
  await db.transaction(async (tx) => {
    await tx.execute("INSERT INTO accounts (name, balance) VALUES (?, ?)", ["Alice", 1000]);
    await tx.execute("INSERT INTO accounts (name, balance) VALUES (?, ?)", ["Bob", 500]);
    // The transaction is automatically committed when this callback finishes successfully
  });

  const result = await db.query("SELECT * FROM accounts");
  console.log(result);

  await db.close();
}

main().catch(console.error);
```

#### Explicit Rollback

You can call `tx.rollback()` at any point within the transaction callback to force an immediate rollback.
`rollback()` throws an error internally, which interrupts the rest of the transaction logic.

```ts
await db.transaction(async (tx) => {
  const [account] = await tx.query<{ balance: number }>(
    "SELECT balance FROM accounts WHERE name = ?",
    ["Alice"]
  );

  if (account.balance < 100) {
    // If there's not enough balance, roll back the transaction here
    await tx.rollback();
  }

  await tx.execute("UPDATE accounts SET balance = balance - 100 WHERE name = ?", ["Alice"]);
  await tx.execute("UPDATE accounts SET balance = balance + 100 WHERE name = ?", ["Bob"]);
});
```

#### Nested Transactions (Savepoints)
NeverChangeDB also supports nested transactions. When `db.transaction` is called inside another transaction,
it creates a new savepoint, so an inner failure rolls back only the nested portion.

```ts
await db.transaction(async (tx) => {
  // Insert within top-level transaction
  await tx.execute("INSERT INTO accounts (name, balance) VALUES (?, ?)", ["Charlie", 200]);

  try {
    // Begin a nested transaction (savepoint)
    await tx.transaction(async (tx2) => {
      await tx2.execute("INSERT INTO accounts (name, balance) VALUES (?, ?)", ["David", 300]);
      // Force an error in the nested transaction
      throw new Error("Error in nested transaction!");
    });
  } catch (err) {
    console.warn("Nested transaction error:", err);
    // Only the nested changes are rolled back
  }

  // Outer transaction can still proceed
  await tx.execute("INSERT INTO accounts (name, balance) VALUES (?, ?)", ["Eve", 400]);
});
```

In the above scenario, the insert for “David” will be rolled back due to the error in the nested transaction,
but the outer transaction remains valid and will commit the other statements unless it encounters its own error.

#### Returning Values

If your callback returns a value, that value is also returned from the `transaction` method:

```ts
const updatedBalance = await db.transaction(async (tx) => {
  await tx.execute("UPDATE accounts SET balance = balance - 50 WHERE name = ?", ["Alice"]);
  const [row] = await tx.query<{ balance: number }>(
    "SELECT balance FROM accounts WHERE name = ?",
    ["Alice"]
  );
  return row.balance;
});

console.log("Alice's updated balance:", updatedBalance);
```

#### Manual `commit()` and `rollback()`
While `transaction` automatically handles commits and rollbacks,
you can also manually call `db.commit()` or `db.rollback()` **inside an active transaction** if needed.
In nested scenarios, these map to `RELEASE SAVEPOINT` or `ROLLBACK TO SAVEPOINT`, respectively.
**Note**: If you manually execute `BEGIN TRANSACTION` (via `db.execute("BEGIN TRANSACTION")`),
it will not increment the internal transaction depth. 
Thus, calling `db.commit()` or `db.rollback()` after a manual `BEGIN` will cause an error
(because the library doesn't recognize it as an active transaction).

### Dump and Import Features

NeverChangeDB offers two modes for database dump and import: Optimized Mode and SQLite Compatibility Mode.

#### Optimized Mode (Default)

In the optimized mode, the dump output does not include transaction control statements or PRAGMA settings. This mode is designed for:

- Flexibility: Allows for custom transaction control during import.
- Consistency: Ensures the entire import process is wrapped in a single transaction.
- Error Handling: Facilitates easy rollback in case of import errors.
- Performance: Enables fine-tuned control over transaction size and checkpoints for large datasets.
- Platform Independence: Improves compatibility between different SQLite implementations.

#### SQLite Compatibility Mode

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

#### Handling of BLOB Data

When using the dump and import features, special attention should be paid to BLOB (Binary Large Object) data:

- **Dumping BLOB Data**: BLOB data is serialized into a special string format during the dump process. This ensures that binary data is correctly represented in the dump output.

- **Importing BLOB Data**: When importing, the special string format for BLOB data is automatically detected and converted back into the appropriate binary format.

- **Working with BLOB Data**: After importing, BLOB data may be represented as an object with numeric keys (e.g., `{"0":1,"1":2,"2":3}`). To work with this data as a `Uint8Array`, you may need to convert it:

```javascript
const convertToUint8Array = (obj) => {
   if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return new Uint8Array(Object.values(obj));
   }

   return obj;
};

// Usage
const blobData = convertToUint8Array(row.blobColumn);
```

#### Limitations and Considerations

 - **Large Databases**: When working with large databases, consider the memory limitations of the browser environment. For very large datasets, you may need to implement chunking strategies for dump and import operations.
 - **Complex Data Types**: While NeverChangeDB handles most SQLite data types seamlessly, complex types like JSON or custom data structures may require additional processing when dumping or importing.
 - **Cross-Browser Compatibility**: Although the core functionality is designed to work across modern browsers, some advanced features or performance optimizations may vary between different browser environments. Always test thoroughly in your target browsers.

### CSV Export and Import

NeverChangeDB also supports CSV export and import functionality, which is useful for integrating with spreadsheet applications and external data sources.

#### CSV Export

You can export a table to a CSV format using the `dumpTableToCSV` method:

```typescript
const db = new NeverChangeDB('myDatabase');
await db.init();

/* We will assume that you have added tables and information */

const csvContent = await db.dumpTableToCSV('your_table');
console.log('CSV Export:', csvContent);

await db.close();
```

This will export the contents of `your_table` to a CSV string.

#### CSV Import

You can import CSV content into a table using the `importCSVToTable` method:

```typescript
const db = new NeverChangeDB('myDatabase');
await db.init();

const csvContent = `id,name,email\n1,John Doe,john@example.com\n2,Jane Smith,jane@example.com`;
await db.importCSVToTable('your_table', csvContent);

await db.close();
```

This will insert the CSV data into the `your_table` table. Ensure the table is created beforehand and the columns match the CSV headers.

## For Developers

![For Developers image](./images/for-developers-image.jpg)

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

**Run E2E tests:**
```
npm run e2e
```

In CI tests, `Chrome` and `Edge` do not work, but you can test locally by adding the following settings.  
(https://github.com/shinshin86/neverchange/issues/12)

```diff
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -12,6 +12,22 @@ export default defineConfig({
     trace: 'on-first-retry',
   },
   projects: [
+    {
+      name: 'Google Chrome',
+      use: {
+        ...devices['Desktop Chrome'],
+        channel: 'chrome',
+        headless: false,
+      },
+    },
+    {
+      name: 'Microsoft Edge',
+      use: {
+        ...devices['Desktop Edge'],
+        channel: 'msedge',
+        headless: false,
+      },
+    },
     {
       name: 'chromium',
       use: {
```

**Code Format:**

```
npm run fmt
```

## License

This project is released under the [MIT License](LICENSE).