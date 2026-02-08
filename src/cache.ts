import * as cache from "@actions/cache";
import * as core from "@actions/core";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type {
	CoverageArtifact,
	FileCoverage,
} from "./types.js";

const CACHE_DIR = ".coverage-reporter-cache";

function artifactPath(tool: string): string {
	return join(CACHE_DIR, `${tool}.json`);
}

/**
 * Attempt to restore a cached base-branch coverage artifact for the given tool.
 */
export async function restoreBaseArtifact(
	tool: string,
	cacheKeyPrefix: string,
	baseBranch: string,
): Promise<CoverageArtifact | null> {
	const path = artifactPath(tool);
	const key = `${cacheKeyPrefix}-${tool}-${baseBranch}`;
	const restoreKeys = [`${cacheKeyPrefix}-${tool}-`];

	try {
		const hit = await cache.restoreCache([path], key, restoreKeys);
		if (hit && existsSync(path)) {
			const raw = readFileSync(path, "utf-8");
			const artifact: CoverageArtifact = JSON.parse(raw);
			core.info(`Cache hit for ${tool} base artifact (key=${hit})`);
			return artifact;
		}
	} catch (err: unknown) {
		core.warning(`Failed to restore cache for ${tool}: ${(err as Error).message}`);
	}
	return null;
}

/**
 * Save a coverage artifact to cache so future runs on other branches can diff
 * against it.
 */
export async function saveArtifact(
	tool: string,
	files: FileCoverage[],
	commitSha: string,
	branch: string,
	cacheKeyPrefix: string,
): Promise<void> {
	const artifact: CoverageArtifact = {
		tool,
		files,
		commitSha,
		branch,
		timestamp: new Date().toISOString(),
	};

	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true });
	}

	const path = artifactPath(tool);
	writeFileSync(path, JSON.stringify(artifact, null, 2));

	const key = `${cacheKeyPrefix}-${tool}-${branch}-${commitSha}`;
	try {
		await cache.saveCache([path], key);
		core.info(`Saved cache for ${tool} (key=${key})`);
	} catch (err: unknown) {
		// Cache save can fail if key already exists — that's fine
		core.warning(`Cache save for ${tool} (non-fatal): ${(err as Error).message}`);
	}
}
