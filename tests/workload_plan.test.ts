import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkloadPlan } from '../src/commands/workload_plan.js';

describe('WorkloadPlan.inContainerPath', () => {
	it('maps the project root to /work', () => {
		assert.equal(WorkloadPlan.inContainerPath('/proj', '/proj'), '/work');
	});

	it('maps a subdirectory under the project to /work/<rel>', () => {
		assert.equal(WorkloadPlan.inContainerPath('/proj', '/proj/src'), '/work/src');
	});

	it('maps a nested path under the project', () => {
		assert.equal(
			WorkloadPlan.inContainerPath('/proj', '/proj/sample_projects/p1/src'),
			'/work/sample_projects/p1/src',
		);
	});

	it('throws when the path is outside the project', () => {
		assert.throws(() => WorkloadPlan.inContainerPath('/proj', '/other/src'), /outside/);
	});
});

describe('WorkloadPlan.driverRelative', () => {
	it('returns the driver path relative to the project', () => {
		assert.equal(
			WorkloadPlan.driverRelative('/proj', '/proj/.codespine/workload/driver.ts'),
			'.codespine/workload/driver.ts',
		);
	});

	it('handles a driver at the project root', () => {
		assert.equal(WorkloadPlan.driverRelative('/proj', '/proj/driver.ts'), 'driver.ts');
	});

	it('throws when the driver is outside the project', () => {
		assert.throws(() => WorkloadPlan.driverRelative('/proj', '/other/driver.ts'), /must be inside/);
	});
});

describe('WorkloadPlan.scaffoldFiles', () => {
	it('always includes the Dockerfile first', () => {
		for (const kind of ['cpu-profile', 'loadtest', 'both']) {
			assert.deepEqual(WorkloadPlan.scaffoldFiles(kind)[0], { src: 'Dockerfile', dest: 'Dockerfile' });
		}
	});

	it('writes only the cpu-profile driver for kind cpu-profile', () => {
		assert.deepEqual(WorkloadPlan.scaffoldFiles('cpu-profile'), [
			{ src: 'Dockerfile', dest: 'Dockerfile' },
			{ src: 'cpu_profile_driver.template.ts', dest: 'cpu_profile_driver.ts' },
		]);
	});

	it('writes only the loadtest driver for kind loadtest', () => {
		assert.deepEqual(WorkloadPlan.scaffoldFiles('loadtest'), [
			{ src: 'Dockerfile', dest: 'Dockerfile' },
			{ src: 'loadtest_driver.template.ts', dest: 'loadtest_driver.ts' },
		]);
	});

	it('writes both drivers for kind both', () => {
		assert.deepEqual(WorkloadPlan.scaffoldFiles('both'), [
			{ src: 'Dockerfile', dest: 'Dockerfile' },
			{ src: 'cpu_profile_driver.template.ts', dest: 'cpu_profile_driver.ts' },
			{ src: 'loadtest_driver.template.ts', dest: 'loadtest_driver.ts' },
		]);
	});
});
