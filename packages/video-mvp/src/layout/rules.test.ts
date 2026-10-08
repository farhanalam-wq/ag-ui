// Phase-1 checkpoint: layout rules hold on real planner output + stress cases.
// Run: bun packages/video-mvp/src/layout/rules.test.ts
import { headerZone, topology, nodeWidth, sceneLayout, BODY_W } from "./rules";
import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
}

// Real planner output (11-04 run: 2 flow + 1 concept)
const plan = JSON.parse(readFileSync("outputs/2026-10-08T11-04-19-what-are-the-main-products-and-how-do-th/plan.json", "utf8"));
for (const s of plan.scenes) {
  const lay = sceneLayout(s.headline, s.caption);
  check(`[${s.id}] header+body fits 720`, lay.bodyH >= 180, `bodyH=${lay.bodyH}`);
  if (s.type === "flow") {
    check(`[${s.id}] topology hub (branching edges)`, topology(s.nodes, s.edges) === "hub");
    const w = nodeWidth(s.nodes.length);
    check(`[${s.id}] 3 nodes fit ${BODY_W}`, w * s.nodes.length + (s.nodes.length - 1) * 54 <= BODY_W, `w=${w}`);
  }
}

// Stress: max-length headline/caption, 6 nodes, chain
const longHead = "Corporate Learning Platform Overview Extended Enterprise";
const longCap = "Transform documents into effective learning experiences for every team today.";
const lay = sceneLayout(longHead, longCap);
check("stress header clamped", lay.headerHeight <= 330 && lay.bodyH >= 180, `h=${lay.headerHeight} body=${lay.bodyH}`);
check("6 nodes fit", nodeWidth(6) * 6 + 5 * 54 <= BODY_W, `w=${nodeWidth(6)}`);
check("chain without edges", topology([{ id: "a" }, { id: "b" }]) === "chain");

if (failures > 0) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
console.log("All layout rules hold.");
