import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GitSource } from '../src/extract/git_source.js';

describe('GitSource.githubBaseUrl', () => {
	it('normalises the SCP-like form', () => {
		assert.equal(GitSource.githubBaseUrl('git@github.com:owner/repo.git'), 'https://github.com/owner/repo');
	});

	it('normalises the https form, with and without .git', () => {
		assert.equal(GitSource.githubBaseUrl('https://github.com/owner/repo.git'), 'https://github.com/owner/repo');
		assert.equal(GitSource.githubBaseUrl('https://github.com/owner/repo'), 'https://github.com/owner/repo');
	});

	it('normalises the ssh:// and git:// forms', () => {
		assert.equal(GitSource.githubBaseUrl('ssh://git@github.com/owner/repo.git'), 'https://github.com/owner/repo');
		assert.equal(GitSource.githubBaseUrl('git://github.com/owner/repo.git'), 'https://github.com/owner/repo');
	});

	it('tolerates a trailing slash and surrounding whitespace', () => {
		assert.equal(GitSource.githubBaseUrl('  https://github.com/owner/repo/  '), 'https://github.com/owner/repo');
	});

	it('keeps the host for GitHub Enterprise remotes', () => {
		assert.equal(GitSource.githubBaseUrl('git@github.example.com:owner/repo.git'), 'https://github.example.com/owner/repo');
	});

	it('returns undefined for non-GitHub hosts', () => {
		assert.equal(GitSource.githubBaseUrl('git@gitlab.com:owner/repo.git'), undefined);
		assert.equal(GitSource.githubBaseUrl('https://bitbucket.org/owner/repo.git'), undefined);
	});

	it('returns undefined for unparseable or incomplete remotes', () => {
		assert.equal(GitSource.githubBaseUrl('not a url'), undefined);
		assert.equal(GitSource.githubBaseUrl('https://github.com/owner'), undefined);
	});
});
