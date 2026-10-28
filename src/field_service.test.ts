import test from "node:test";
import assert from "node:assert/strict";
import { decidePresence } from "./field_service.ts";

test("an on-site technician is attached to the exact work-order photo document", () => {
  const result = decidePresence({ workOrderId: "WO-1042", photoId: "arrival", technicianId: "tech-7", sessionId: "session-1042", dispatchStatus: "on_site", cursor: { x: 0.42, y: 0.68 } });
  assert.deepEqual(result, { document: "work-order/WO-1042/photo/arrival", status: "on_site", cursor: { x: 0.42, y: 0.68 } });
});
