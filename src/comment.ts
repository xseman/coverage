import * as github from "@actions/github";

export interface CommentResult {
	commentId: number;
	created: boolean;
}

/**
 * Find an existing PR comment containing the given marker string,
 * then create or update accordingly.
 */
export async function upsertComment(
	token: string,
	marker: string,
	body: string,
	prNumber: number,
): Promise<CommentResult> {
	const octokit = github.getOctokit(token);
	const { owner, repo } = github.context.repo;

	// Paginate through existing comments to find the one with our marker
	let existingCommentId: number | null = null;

	for await (
		const response of octokit.paginate.iterator(
			octokit.rest.issues.listComments,
			{ owner, repo, issue_number: prNumber, per_page: 100 },
		)
	) {
		for (const comment of response.data) {
			if (comment.body && comment.body.includes(marker)) {
				existingCommentId = comment.id;
				break;
			}
		}
		if (existingCommentId) break;
	}

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
