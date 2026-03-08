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
import {
	findComment,
	upsertComment,
} from "./comment.js";
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
import {
	getCoverageParser,
	getSupportedCoverageTools,
} from "./parser.js";
import {
	formatPercent,
	formatPercentValue,
} from "./percent.js";
import {
	extractCoverageData,
	renderReport,
} from "./render.js";
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
		const parser = getCoverageParser(tool);
		if (!parser) {
			warnings.push(`Unknown tool "${tool}". Supported: ${getSupportedCoverageTools().join(", ")}.`);
			return {
				files: [],
				warnings,
			};
		}

		return {
			files: parser(content),
			warnings,
		};
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
		let baseSha: string | undefined;

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

			if (baseArtifact && !baseSha) {
				baseSha = baseArtifact.commitSha;
			}

			const report = buildToolReport(input.tool, headFiles, baseArtifact, warnings);
			toolReports.push(report);

			// Match the public contract: any file-level decrease trips the flag.
			if (report.files.some((file) => file.delta !== null && file.delta < 0)) {
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

		// Resolve PR number early so we can look up the existing comment for merging
		const prNumber = await resolvePrNumber(prNumberInput, token);

		// Merge with previously stored tool reports from the same sticky comment.
		// This allows separate workflows (e.g. TS and Go) to contribute to one comment.
		let existingCommentId: number | undefined;
		if (prNumber && token) {
			try {
				const existing = await findComment(token, marker, prNumber);
				if (existing) {
					existingCommentId = existing.id;
					const stored = extractCoverageData(existing.body);
					if (stored) {
						const currentTools = new Set(toolReports.map((r) => r.tool));
						for (const prev of stored.tools) {
							if (!currentTools.has(prev.tool)) {
								toolReports.push(prev);
							}
						}
						if (!baseSha && stored.baseSha) {
							baseSha = stored.baseSha;
						}
						core.info(`Merged ${stored.tools.length} stored tool report(s) from existing comment`);
					}
				}
			} catch {
				core.warning("Could not read existing comment for merging");
			}
		}

		// Build full report
		const fullReport = buildFullReport(toolReports);

		// Render markdown
		const { owner, repo } = github.context.repo;
		const commitInfo = showCommitLink ? { sha: commitSha, baseSha, owner, repo } : undefined;
		const markdown = renderReport(fullReport, marker, colorize, commitInfo);

		// Set outputs
		core.setOutput("overall-coverage", formatPercentValue(fullReport.overall.percent));
		core.setOutput("coverage-decreased", anyDecrease ? "true" : "false");

		// Post / update PR comment
		if (prNumber && token) {
			try {
				core.info(`Upserting comment on PR #${prNumber}`);
				const result = await upsertComment(token, markdown, prNumber, existingCommentId);
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
				`Overall coverage ${formatPercent(fullReport.overall.percent)} is below threshold ${threshold}%`,
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
