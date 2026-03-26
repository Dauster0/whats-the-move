import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** Resolved next to this file (works when Railway root is `server/` → `/app`). */
const data = require("./interest-data.json");

/** [key, label] pairs — same source as app `USER_INTEREST_CHIPS` for not_interested_in. */
export const ALL_INTEREST_LABEL_PAIRS = (data.sections || []).flatMap((sec) =>
  (sec.items || []).map((it) => [String(it.key), String(it.label)])
);
