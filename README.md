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
* ~~Safari~~ (https://github.com/shinshin86/neverchange/issues/6)

### Requirements

- Node.js (version 20 or higher recommended)
- npm (usually comes with Node.js)

### Usage

#### Basic

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

#### Migration

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

#### CSV Export and Import

NeverChangeDB also supports CSV export and import functionality, allowing you to easily work with CSV files in your database.

##### CSV Export

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

##### CSV Import

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