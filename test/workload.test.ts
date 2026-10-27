import { test } from "node:test";
import { strict as assert } from "node:assert";
import { planWorkload } from "../src/spend_policy.ts";

test("subscriber updates receive a bounded subscriber prompt rather than a delivery note", () => {
  const result = planWorkload("subscriber", "New issue arrives Friday");
  assert.match(result.instruction, /existing subscribers: New issue arrives Friday/);
  assert.equal(result.maxTokens, 240);
  assert.doesNotMatch(result.instruction, /digital-asset delivery/);
});
