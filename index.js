import { getOctokit } from '@actions/github';
import * as core from '@actions/core';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

const owner = 'tidev';
const repo = 'titanium_mobile';
const token = process.env.TOKEN || core.getInput('repo-token', { required: true });
const gh = getOctokit(token);
const outputDir = process.env.OUTPUT_DIR || core.getInput('output-dir', { required: true });
const startTime = Date.now();

fs.mkdirsSync(outputDir);

// the following branches will likely never see another release, so no sense
// making a ton of API calls for data that will never change
const legacyBranches = new Set([
	'0_8_X',
	'0_9_0',
	'1_4_1',
	'1_4_X',
	'1_4_X',
	'1_4_X',
	'1_4_X',
	'1_4_X',
	'1_4_X',
	'1_4_X',
	'1_5_X',
	'1_6_X',
	'1_7_X',
	'1_8_X',
	'2_0_X',
	'2_1_X',
	'3_0_X',
	'3_1_X',
	'3_2_X',
	'3_3_X',
	'3_4_1',
	'3_4_X',
	'3_5_X',
	'4_0_X',
	'4_1_X',
	'5_0_X',
	'5_1_1',
	'5_1_X',
	'5_2_X',
	'5_3_X',
	'5_4_X',
	'5_5_X',
	'6_0_X',
	'6_1_X',
	'6_2_1',
	'6_2_X',
	'6_3_X',
	'7_0_X',
	'7_1_X',
	'7_2_X',
	'7_3_X',
	'7_4_X',
	'7_5_X',
	'8_0_X',
	'8_1_X',
	'8_2_X',
	'8_3_X',
	'9_0_X',
	'9_1_X',
	'9_2_X',
	'9_3_X',
	'10_0_X',
	'10_1_X',
	'11_0_X',
	'11_1_X'
]);

const branchesFile = path.join(outputDir, 'branches.json');
const allBranchesList = await getBranches();
const branchList = allBranchesList.filter(branch => !legacyBranches.has(branch));
const branches = branchList
	.reduce((obj, branch) => {
		obj[branch] = 0;
		return obj;
	}, fs.readJsonSync(branchesFile));
console.log(`${allBranchesList.length} branches (${branchList.length} being refreshed)`);

for (const [ type, releases ] of Object.entries(await getReleases())) {
	console.log(`${releases.length} ${type} releases`);
	fs.outputJsonSync(path.join(outputDir, `${type}.json`), releases, { spaces: 2 });
}

for (const branch of branchList) {
	const builds = await getBranchBuilds(branch);
	branches[branch] = builds.length;
	console.log(`${builds.length} ${branch} builds`);
	fs.outputJsonSync(path.join(outputDir, `${branch}.json`), builds, { spaces: 2 });
}

fs.outputJsonSync(branchesFile, branches, { spaces: 2 });

console.log(`Completed successfully in ${Math.floor((Date.now() - startTime) / 1000)} seconds!`);

async function getBranches() {
	const branchRE = /^master|\d+_\d+_(\d+|[Xx])$/;
	const iterator = await gh.paginate.iterator(
		gh.rest.repos.listBranches,
		{ owner, repo, per_page: 100 }
	);
	const branches = [];
	const re = /^(\d+)_(\d+)_(\d+|[X])$/;

	for await (const { data } of iterator) {
		console.log(`Received ${data.length} branches...`);
		for (const branch of data) {
			if (branchRE.test(branch.name)) {
				branches.push(branch.name);
			}
		}
	}

	return branches.sort((a, b) => {
		const am = a.toUpperCase().match(re);
		const bm = b.toUpperCase().match(re);
	
		// non-version branches
		if (!am && bm) {
			return -1;
		}
		if (am && !bm) {
			return 1;
		}
		if (!am && !bm) {
			return a.localeCompare(b);
		}
	
		// major
		let n = parseInt(bm[1]) - parseInt(am[1]);
		if (n !== 0) {
			return n;
		}
	
		// minor
		n = parseInt(bm[2]) - parseInt(am[2]);
		if (n !== 0) {
			return n;
		}
	
		// patch
		if (am[3] !== 'X' && bm[3] !== 'X') {
			return parseInt(bm[3]) - parseInt(am[3]);
		}	
		return am[3] === 'X' ? -1 : bm[3] === 'X' ? 1 : 0;
	});
}

async function getBranchBuilds(branch) {
	const iterator = await gh.paginate.iterator(
		gh.rest.actions.listWorkflowRunsForRepo,
		{
			owner,
			repo,
			branch,
			status: 'success',
			per_page: 100
		}
	);
	const re = /^mobilesdk-((\d+\.\d+\.\d+)\.(v\d+))-(\w+)$/;
	const builds = [];
	const now = Date.now();
	for await (const { data } of iterator) {
		console.log(`Received ${data.length} branch builds...`);
		for (const { archived, conclusion, html_url, id, name, status, updated_at } of data) {
			if (archived || name !== 'Build' || status !== 'completed' || conclusion !== 'success') {
				continue;
			}
			const artifacts = await gh.rest.actions.listWorkflowRunArtifacts({
				owner,
				repo,
				run_id: id
			});
			for (const a of artifacts.data.artifacts) {
				const { name, version } = parseName(a.name, re);
				if (name) {
					const assets = [];
					let expires = null;
					for (const a of artifacts.data.artifacts) {
						const m = a.name.match(re);
						if (m) {
							const ex = a.expires_at && Date.parse(a.expires_at);
							if (ex && (!expires || ex < expires)) {
								expires = ex;
							}
							assets.push({
								os: m[4],
								size: a.size_in_bytes,
								url: `https://nightly.link/tidev/titanium_mobile/actions/runs/${id}/${a.name}.zip`
							});
						}
					}
					if (assets.length && expires > now) {
						builds.push({
							name,
							version,
							date: updated_at,
							expires: expires ? new Date(expires).toISOString() : null,
							url: html_url,
							assets
						});
					}
					break;
				}
			}
		
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	}
	return builds;
}

async function getReleases() {
	const iterator = await gh.paginate.iterator(
		gh.rest.repos.listReleases,
		{ owner, repo, per_page: 100 }
	);
	const re = /^mobilesdk-((\d+\.\d+\.\d+)\.(GA|RC|Beta))-(\w+)\.zip$/;
	const releases = {
		ga: [],
		rc: [],
		beta: []
	};
	for await (const { data } of iterator) {
		console.log(`Received ${data.length} releases...`);
		for (const { assets, published_at, html_url } of data) {
			for (const a of assets) {
				const { name, version, label } = parseName(a.name, re);
				if (name) {
					releases[label.toLowerCase()].push({
						name,
						version,
						date: published_at,
						url: html_url,
						assets: assets.map(a => ({
							os: a.name.match(re)[4],
							size: a.size,
							url: a.browser_download_url
						}))
					});
					break;
				}
			}
		}
		await new Promise(resolve => setTimeout(resolve, 2000));
	}
	for (const r of Object.values(releases)) {
		r.sort((a, b) => semver.rcompare(a.version, b.version));
	}
	return releases;
}

function parseName(name, re) {
	const m = name.match(re);
	if (m) {
		const [ _, name, version, label ] = m;
		return {
			name,
			version,
			label
		};
	}
	return {};
}
