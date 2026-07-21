#!/usr/bin/env node

/**
 * Generate TypeScript types from the OpenAPI spec.
 *
 * 1. Runs openapi-typescript to produce src/generated/schema.ts
 * 2. Reads schema names from the spec and writes a barrel re-export
 *    at src/generated/models/index.ts so existing imports stay the same.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const specPath = resolve(root, "..", "openapi.json");
const schemaOut = resolve(root, "src", "generated", "schema.ts");
const barrelOut = resolve(root, "src", "generated", "models", "index.ts");

// 1. Generate schema types
console.log("Generating schema types from OpenAPI spec...");
execSync(`npx openapi-typescript ${specPath} -o ${schemaOut}`, {
  cwd: root,
  stdio: "inherit",
});

// 2. Read schema names from the spec
const spec = JSON.parse(readFileSync(specPath, "utf-8"));
const schemaNames = Object.keys(spec.components?.schemas ?? {}).sort();

// 3. Write barrel re-export file
const lines = [
  "// Auto-generated from OpenAPI spec — do not edit manually.",
  '// Run `npm run generate` to regenerate.',
  "",
  'import type { components } from "../schema.js";',
  "",
  "type Schemas = components[\"schemas\"];",
  "",
  ...schemaNames.map((name) => `export type ${name} = Schemas["${name}"];`),
  "",
];

mkdirSync(dirname(barrelOut), { recursive: true });
writeFileSync(barrelOut, lines.join("\n"));
console.log(`Wrote barrel exports for ${schemaNames.length} schemas to src/generated/models/index.ts`);
