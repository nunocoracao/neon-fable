import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { findHardCodedStrings } from "./stringLint";
const dir = join(process.cwd(), "src/ui");
it("dump", () => {
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const hits = findHardCodedStrings(readFileSync(join(dir, f), "utf8"));
    if (hits.length) {
      console.log(`\n#### ${f}  (${hits.length})`);
      for (const h of hits) console.log(`  ${h.line} ${h.sink} :: ${h.text}`);
    }
  }
});
