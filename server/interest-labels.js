import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dir, "../lib/interest-data.json"), "utf8");
const data = JSON.parse(raw);

/** [key, label] pairs — same source as app `USER_INTEREST_CHIPS` for not_interested_in. */
export const ALL_INTEREST_LABEL_PAIRS = (data.sections || []).flatMap((sec) =>
  (sec.items || []).map((it) => [String(it.key), String(it.label)])
);
