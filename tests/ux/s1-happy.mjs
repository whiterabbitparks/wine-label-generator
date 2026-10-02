import { session } from "./robot.mjs";
import { open, toLabels, select, forwardTo, report } from "./flows.mjs";
const s = await session("s1-happy");
await open(s); await toLabels(s); await select(s, 0);
await forwardTo(s, "checkout", 10);
console.log("reached", s.where());
console.log(report(await s.done()).join("\n"));
