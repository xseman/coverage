import * as github from "@actions/github";

export interface CommentResult {
	commentId: number;
	created: boolean;
}

export interface ExistingComment {
	id: number;
	body: string;
}

/**
 * Find an existing PR comment containing the given marker string.
 */
export async function findComment(
	token: string,
	marker: string,
	prNumber: number,
): Promise<ExistingComment | null> {
	const octokit = github.getOctokit(token);
	const { owner, repo } = github.context.repo;

	for await (
		const response of octokit.paginate.iterator(
			octokit.rest.issues.listComments,
			{ owner, repo, issue_number: prNumber, per_page: 100 },
		)
	) {
		for (const comment of response.data) {
			if (comment.body && comment.body.includes(marker)) {
				return { id: comment.id, body: comment.body };
			}
		}
	}

	return null;
}

/**
 * Find an existing PR comment containing the given marker string,
 * then create or update accordingly.
 */
export async function upsertComment(
	token: string,
	body: string,
	prNumber: number,
	existingCommentId?: number,
): Promise<CommentResult> {
	const octokit = github.getOctokit(token);
	const { owner, repo } = github.context.repo;

	if (existingCommentId) {
		await octokit.rest.issues.updateComment({
			owner,
			repo,
			comment_id: existingCommentId,
			body,
		});
		return { commentId: existingCommentId, created: false };
	}

	const { data } = await octokit.rest.issues.createComment({
		owner,
		repo,
		issue_number: prNumber,
		body,
	});

	return { commentId: data.id, created: true };
}
