import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(exec);

export type VerifyResult = {
	ok: boolean;
	output: string;
};

export class Verifier {
	static async typecheck(rootPath: string): Promise<VerifyResult> {
		return Verifier.runCommand('npx tsc --noEmit', rootPath);
	}

	private static async runCommand(command: string, cwd: string): Promise<VerifyResult> {
		try {
			const { stdout, stderr } = await run(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
			return { ok: true, output: `${stdout}${stderr}`.trim() };
		} catch (error) {
			const shaped = error as { stdout?: string; stderr?: string };
			return { ok: false, output: `${shaped.stdout ?? ''}${shaped.stderr ?? ''}`.trim() };
		}
	}
}
