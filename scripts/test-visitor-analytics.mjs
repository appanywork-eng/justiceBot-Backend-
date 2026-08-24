import assert from "node:assert/strict";
import fs from "node:fs";

import { VisitorAnalyticsStore } from "../lib/visitorAnalyticsStore.mjs";

const store = new VisitorAnalyticsStore({ enabled: false });

assert.deepEqual(await store.stats(), {
  daily_users: 0,
  new_users_today: 0,
  monthly_users: 0,
  total_unique_users: 0,
  active_users: 0,
  latest_new_user_at: null,
});

assert.deepEqual(await store.record("anonymous-visitor-one"), {
  tracked: true,
  isNew: true,
});

assert.deepEqual(await store.record("anonymous-visitor-one"), {
  tracked: true,
  isNew: false,
});

await store.record("anonymous-visitor-two");

const analytics = await store.stats();

assert.equal(analytics.daily_users, 2);
assert.equal(analytics.new_users_today, 2);
assert.equal(analytics.monthly_users, 2);
assert.equal(analytics.total_unique_users, 2);
assert.equal(analytics.active_users, 2);
assert.ok(analytics.latest_new_user_at);

const server = fs.readFileSync("server.mjs", "utf8");

assert.match(server, /createHash\("sha256"\)/);
assert.match(server, /\.\.\.await getAnonymousVisitorStats\(\)/);

console.log("✅ ANONYMOUS REPEAT VISITORS ARE NOT COUNTED AS NEW USERS");
console.log("✅ DAILY, MONTHLY, TOTAL AND ACTIVE VISITOR COUNTS ARE ACCURATE");
console.log("✅ ADMIN OVERVIEW RECEIVES PRIVACY-PRESERVING VISITOR ANALYTICS");
console.log("✅ VISITOR ANALYTICS REGRESSION PASSED");
