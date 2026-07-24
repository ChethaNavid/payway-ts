import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The root package.json declares "type": "module", which would make Node treat
 * the .js files emitted into dist/cjs as ESM. Dropping a package.json with
 * "type": "commonjs" into that directory scopes it back to CommonJS.
 *
 * Run as the last step of `npm run build`.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "dist", "cjs", "package.json");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ type: "commonjs" }, null, 2) + "\n");

console.log(`wrote ${target}`);
