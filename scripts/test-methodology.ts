import assert from "node:assert/strict";
import { data } from "../lib/data";
import { methodologySourceLabels } from "../lib/methodology";

const current = methodologySourceLabels(data);
assert.match(current.budgets, /September 2026/);
assert.match(current.poll, new RegExp(`Week ${data.poll.week}`));
assert.match(current.fpi, /2026/);

const later = methodologySourceLabels({
  ...data,
  source: { ...data.source, note: "Estimated roster budgets, updated in October 2026." },
  poll: { ...data.poll, week: data.poll.week + 1, as_of: "2026-09-27" },
  fpi: { ...data.fpi, as_of: "2026-09-29" },
});
assert.match(later.budgets, /October 2026/);
assert.equal(later.poll, `Week ${data.poll.week + 1} · Sept. 27, 2026`);
assert.equal(later.fpi, "Sept. 29, 2026");
assert.notEqual(later.poll, current.poll);
console.log("Methodology source labels follow snapshot updates.");
