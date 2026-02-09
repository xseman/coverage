import * as core from "@actions/core";
import * as github from "@actions/github";
import {
	existsSync,
	readFileSync,
} from "node:fs";

import {
	restoreBaseArtifact,
	saveArtifact,
} from "./cache.js";
import { upsertComment } from "./comment.js";
import {
	resolveBaseBranch,
	resolveCurrentBranch,
	resolveHeadSha,
	resolvePrNumber,
} from "./context.js";
import {
	buildFullReport,
	buildToolReport,
} from "./diff.js";
import { parseGoCover } from "./go.js";
import { parseLcov } from "./lcov.js";
import { renderReport } from "./render.js";
import type {
	ArtifactInput,
	FileCoverage,
} from "./types.js";

function parseArtifactInputs(raw: string): ArtifactInput[] {
	return raw
		.split(/[\n,]+/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((entry) => {
			const colonIdx = entry.indexOf(":");
			if (colonIdx === -1) {
				throw new Error(
					`Invalid artifact entry "${entry}". Expected format: <tool>:<path> (e.g. bun:coverage/lcov.info)`,
				);
			}
			return {
				tool: entry.slice(0, colonIdx).trim().toLowerCase(),
				path: entry.slice(colonIdx + 1).trim(),
			};
		});
}

function parseFile(tool: string, filePath: string): { files: FileCoverage[]; warnings: string[]; } {
	const warnings: string[] = [];

	if (!existsSync(filePath)) {
		warnings.push(`Artifact file not found: \`${filePath}\``);
		return { files: [], warnings };
	}

	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch (err: unknown) {
		warnings.push(`Could not read \`${filePath}\`: ${(err as Error).message}`);
		return { files: [], warnings };
	}

	if (!content.trim()) {
		warnings.push(`Artifact file is empty: \`${filePath}\``);
		return { files: [], warnings };
	}

	try {
		switch (tool) {
			case "bun":
			case "lcov":
				return { files: parseLcov(content), warnings };
			case "go":
			case "gocover":
				return { files: parseGoCover(content), warnings };
			default:
				warnings.push(`Unknown tool "${tool}". Supported: bun, lcov, go, gocover.`);
				return { files: [], warnings };
		}
	} catch (err: unknown) {
		warnings.push(
			`Failed to parse \`${filePath}\` as ${tool} coverage: ${(err as Error).message}`,
		);
		return { files: [], warnings };
	}
}

async function run(): Promise<void> {
	try {
		// Read inputs
		const artifactPathsRaw = core.getInput("coverage-artifact-paths", { required: true });
		const inputBaseBranch = core.getInput("base-branch");
		const cacheKeyPrefix = core.getInput("cache-key") || "coverage-reporter";
		const marker = core.getInput("update-comment-marker")
			|| "<!-- coverage-reporter-sticky -->";
		const colorize = core.getInput("colorize") !== "off";
		const failOnDecrease = core.getInput("fail-on-decrease") === "true";
		const threshold = parseFloat(core.getInput("coverage-threshold") || "0");
		const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
		const prNumberInput = core.getInput("pull-request-number");
		const showCommitLink = core.getInput("show-commit-link") !== "off";

		// Resolve context-dependent values
		const baseBranch = resolveBaseBranch(inputBaseBranch);
		const commitSha = resolveHeadSha();
		const currentBranch = resolveCurrentBranch();

		// Parse artifact inputs
		const inputs = parseArtifactInputs(artifactPathsRaw);

		if (inputs.length === 0) {
			core.warning("No coverage artifacts found.");
		}

		// Process each tool
		const toolReports = [];
		let anyDecrease = false;

		for (const input of inputs) {
			core.info(`Processing ${input.tool} coverage from ${input.path}`);

			// Parse head
			const { files: headFiles, warnings } = parseFile(input.tool, input.path);

			// Restore base from cache
			let baseArtifact = null;
			try {
				baseArtifact = await restoreBaseArtifact(input.tool, cacheKeyPrefix, baseBranch);
			} catch {
				core.warning(`Could not restore base artifact for ${input.tool}`);
			}

			const report = buildToolReport(input.tool, headFiles, baseArtifact, warnings);
			toolReports.push(report);

			// Check for decreases
			if (report.summary.delta !== null && report.summary.delta < 0) {
				anyDecrease = true;
			}

			// Save current coverage to cache for future comparisons
			if (headFiles.length > 0) {
				try {
					await saveArtifact(
						input.tool,
						headFiles,
						commitSha,
						currentBranch,
						cacheKeyPrefix,
					);
				} catch {
					core.warning(`Could not save cache artifact for ${input.tool}`);
				}
			}
		}

		// Build full report
		const fullReport = buildFullReport(toolReports);

		// Render markdown
		const { owner, repo } = github.context.repo;
		const commitInfo = showCommitLink ? { sha: commitSha, owner, repo } : undefined;
		const markdown = renderReport(fullReport, marker, colorize, commitInfo);

		// Set outputs
		core.setOutput("overall-coverage", fullReport.overall.percent.toFixed(2));
		core.setOutput("coverage-decreased", anyDecrease ? "true" : "false");

		// Post / update PR comment
		const prNumber = await resolvePrNumber(prNumberInput, token);
		if (prNumber && token) {
			try {
				core.info(`Upserting comment on PR #${prNumber}`);
				const result = await upsertComment(token, marker, markdown, prNumber);
				core.setOutput("comment-id", result.commentId.toString());
				core.info(
					result.created
						? `Created comment ${result.commentId}`
						: `Updated comment ${result.commentId}`,
				);
			} catch (err: unknown) {
				core.warning(
					`Could not upsert PR comment: ${(err as Error).message}`,
				);
				core.info("--- Coverage Report ---");
				core.info(markdown);
			}
		} else {
			if (!prNumber) {
				core.warning(
					"Could not determine PR number. Set the `pull-request-number` input "
						+ "or ensure the action runs on pull_request / workflow_run events.",
				);
			}
			// Still output the rendered markdown to the action log
			core.info("--- Coverage Report ---");
			core.info(markdown);
		}

		// Threshold check
		if (threshold > 0 && fullReport.overall.percent < threshold) {
			core.setFailed(
				`Overall coverage ${
					fullReport.overall.percent.toFixed(2)
				}% is below threshold ${threshold}%`,
			);
			return;
		}

		// Fail on decrease
		if (failOnDecrease && anyDecrease) {
			core.setFailed("Coverage decreased compared to base branch.");
			return;
		}

		core.info("Coverage report complete.");
	} catch (error: unknown) {
		core.setFailed(`Coverage Reporter failed: ${(error as Error).message}`);
	}
}

run();
