import * as github from "@actions/github";

type Context = typeof github.context;

/**
 * Resolve the PR number from the event context using a priority chain:
 *
 * 1. Explicit `pull-request-number` input (manual override)
 * 2. `pull_request` / `pull_request_target` event payload
 * 3. `workflow_run` event — first PR in `pull_requests` array
 * 4. API fallback — search open PRs by head SHA
 *
 * Returns `undefined` when no PR can be found.
 */
export async function resolvePrNumber(
	inputOverride: string,
	token: string,
	context: Context = github.context,
): Promise<number | undefined> {
	// 1. Manual override
	if (inputOverride) {
		const n = parseInt(inputOverride, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}

	// 2. Direct PR trigger
	if (context.eventName === "pull_request" || context.eventName === "pull_request_target") {
		const num = context.payload.pull_request?.number;
		if (typeof num === "number") return num;
	}

	// 3. workflow_run trigger — PR was the original event
	if (context.eventName === "workflow_run") {
		const prs: unknown[] | undefined = context.payload.workflow_run?.pull_requests;
		if (Array.isArray(prs) && prs.length > 0) {
			const first = prs[0] as { number?: number; };
			if (typeof first.number === "number") return first.number;
		}

		// 4. API fallback — find PR by head branch
		if (token) {
			const headBranch: string | undefined = context.payload.workflow_run?.head_branch;
			const headRepoOwner: string | undefined = context.payload.workflow_run?.head_repository
				?.owner?.login;
			if (headBranch) {
				try {
					const octokit = github.getOctokit(token);
					const { owner, repo } = context.repo;
					const head = headRepoOwner && headRepoOwner !== owner
						? `${headRepoOwner}:${headBranch}`
						: `${owner}:${headBranch}`;
					const { data: prs } = await octokit.rest.pulls.list({
						owner,
						repo,
						head,
						state: "open",
					});
					if (prs.length > 0) return prs[0].number;
				} catch {
					// Swallowed — caller will get undefined
				}
			}
		}
	}

	return undefined;
}

/**
 * Resolve the head commit SHA from the event context.
 *
 * Under `workflow_run` the SHA of the triggering run is more accurate than
 * `context.sha` (which points at the merge commit on the default branch).
 */
export function resolveHeadSha(context: Context = github.context): string {
	if (context.eventName === "workflow_run") {
		return context.payload.workflow_run?.head_sha ?? context.sha;
	}
	return context.sha;
}

/**
 * Resolve the base branch for cache key scoping.
 *
 * Under `workflow_run`, `context.ref` points to the *default* branch, not the
 * PR base. Use `head_branch` from the triggering run instead. Falls back to the
 * explicit `base-branch` input or `main`.
 */
export function resolveBaseBranch(
	inputBaseBranch: string,
	context: Context = github.context,
): string {
	if (inputBaseBranch) return inputBaseBranch;

	if (context.eventName === "pull_request" || context.eventName === "pull_request_target") {
		return context.payload.pull_request?.base?.ref ?? "main";
	}

	if (context.eventName === "workflow_run") {
		return context.payload.workflow_run?.head_branch ?? "main";
	}

	return context.ref.replace("refs/heads/", "") || "main";
}

/**
 * Resolve the current (head) branch for cache saving.
 *
 * Under `workflow_run`, the head branch comes from the triggering workflow.
 */
export function resolveCurrentBranch(context: Context = github.context): string {
	if (context.eventName === "pull_request" || context.eventName === "pull_request_target") {
		return context.payload.pull_request?.head?.ref
			?? context.ref.replace("refs/heads/", "");
	}

	if (context.eventName === "workflow_run") {
		return context.payload.workflow_run?.head_branch
			?? context.ref.replace("refs/heads/", "");
	}

	return context.ref.replace("refs/heads/", "");
}
