// cpu-profile workload driver (copy to ./.codespine/workload/cpu_profile_driver.ts).
//
// Purpose: exercise your project's real hot path in a deterministic loop so the V8
// sampler catches the in-project frames. Run it under `node --cpu-prof`, then feed
// the resulting .cpuprofile to `codespine enrich`; read the result with
// `codespine hotspots --by self-time` and `codespine cost`.
//
// Run on the host (simplest, uses your existing node_modules):
//   mkdir -p .codespine/workload/prof
//   node --cpu-prof --cpu-prof-dir .codespine/workload/prof \
//     --import tsx .codespine/workload/cpu_profile_driver.ts
//   codespine enrich "$(ls -t .codespine/workload/prof/*.cpuprofile | head -1)" --root .
//   codespine hotspots --by self-time --json
//
// Rules:
//   - This file must live OUTSIDE the extracted source root (./.codespine/ is fine)
//     so it never becomes a graph node.
//   - Keep it deterministic: fixed inputs, no wall-clock branching, just work. A
//     numeric `sink` printed at the end stops the optimizer eliding the loop.
//   - Imports are module-relative (they resolve against THIS file's location), so
//     point them at your project's source from here.

// ============================================================================
// EDIT FOR YOUR PROJECT — import your hot module(s) and exercise them.
// ============================================================================

// import { YourModule } from '../../src/your_module.js';

/** How many iterations: enough that the sampler collects thousands of samples. */
const ITERATIONS = 200_000;

function runWorkload(): number {
	let sink = 0;
	for (let index = 0; index < ITERATIONS; index += 1) {
		// Call the real public API you want to attribute time to, e.g.:
		//   sink += YourModule.hotFunction(buildInput(index)).length;
		sink += index & 1;
	}
	return sink;
}

// ============================================================================
// Generic — no need to edit.
// ============================================================================
console.log(runWorkload());
