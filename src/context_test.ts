import {
	describe,
	expect,
	test,
} from "bun:test";

import {
	resolveBaseBranch,
	resolveCurrentBranch,
	resolveHeadSha,
	resolvePrNumber,
} from "./context";

function makeContext(overrides: {
	eventName?: string;
	sha?: string;
	ref?: string;
	payload?: Record<string, unknown>;
	repo?: { owner: string; repo: string; };
}) {
	return {
		eventName: overrides.eventName ?? "push",
		sha: overrides.sha ?? "aaa111",
		ref: overrides.ref ?? "refs/heads/main",
		payload: overrides.payload ?? {},
		repo: overrides.repo ?? { owner: "test-owner", repo: "test-repo" },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe("resolvePrNumber", () => {
	test("returns input override when provided", async () => {
		const ctx = makeContext({ eventName: "push" });
		expect(await resolvePrNumber("42", "", ctx)).toBe(42);
	});

	test("ignores invalid input override", async () => {
		const ctx = makeContext({ eventName: "push" });
		expect(await resolvePrNumber("abc", "", ctx)).toBeUndefined();
		expect(await resolvePrNumber("0", "", ctx)).toBeUndefined();
		expect(await resolvePrNumber("-5", "", ctx)).toBeUndefined();
	});

	test("resolves from pull_request event", async () => {
		const ctx = makeContext({
			eventName: "pull_request",
			payload: { pull_request: { number: 99 } },
		});
		expect(await resolvePrNumber("", "", ctx)).toBe(99);
	});

	test("resolves from pull_request_target event", async () => {
		const ctx = makeContext({
			eventName: "pull_request_target",
			payload: { pull_request: { number: 77 } },
		});
		expect(await resolvePrNumber("", "", ctx)).toBe(77);
	});

	test("resolves from workflow_run.pull_requests", async () => {
		const ctx = makeContext({
			eventName: "workflow_run",
			payload: {
				workflow_run: {
					pull_requests: [{ number: 55 }],
					head_branch: "feature-x",
				},
			},
		});
		expect(await resolvePrNumber("", "", ctx)).toBe(55);
	});

	test("falls back to API when workflow_run.pull_requests is empty", async () => {
		// Mock the GitHub API call by providing a token that will trigger the
		// API fallback. Since we can't actually call the API here, we test that
		// undefined is returned when the API is unreachable.
		const ctx = makeContext({
			eventName: "workflow_run",
			payload: {
				workflow_run: {
					pull_requests: [],
					head_branch: "feature-x",
					head_repository: { owner: { login: "test-owner" } },
				},
			},
		});
		// No token → skips API fallback → undefined
		expect(await resolvePrNumber("", "", ctx)).toBeUndefined();
	});

	test("returns undefined when all fallbacks fail", async () => {
		const ctx = makeContext({ eventName: "workflow_run", payload: { workflow_run: {} } });
		expect(await resolvePrNumber("", "", ctx)).toBeUndefined();
	});

	test("returns undefined for push event without override", async () => {
		const ctx = makeContext({ eventName: "push" });
		expect(await resolvePrNumber("", "", ctx)).toBeUndefined();
	});

	test("input override takes precedence over event payload", async () => {
		const ctx = makeContext({
			eventName: "pull_request",
			payload: { pull_request: { number: 99 } },
		});
		expect(await resolvePrNumber("5", "", ctx)).toBe(5);
	});
});

describe("resolveHeadSha", () => {
	test("returns context.sha for pull_request event", () => {
		const ctx = makeContext({ eventName: "pull_request", sha: "pr-sha-123" });
		expect(resolveHeadSha(ctx)).toBe("pr-sha-123");
	});

	test("returns workflow_run.head_sha for workflow_run event", () => {
		const ctx = makeContext({
			eventName: "workflow_run",
			sha: "default-sha",
			payload: { workflow_run: { head_sha: "wr-sha-456" } },
		});
		expect(resolveHeadSha(ctx)).toBe("wr-sha-456");
	});

	test("falls back to context.sha when workflow_run.head_sha missing", () => {
		const ctx = makeContext({
			eventName: "workflow_run",
			sha: "fallback-sha",
			payload: { workflow_run: {} },
		});
		expect(resolveHeadSha(ctx)).toBe("fallback-sha");
	});
});

describe("resolveCurrentBranch", () => {
	test("returns pull_request.head.ref for PR event", () => {
		const ctx = makeContext({
			eventName: "pull_request",
			ref: "refs/heads/main",
			payload: { pull_request: { head: { ref: "feature-branch" } } },
		});
		expect(resolveCurrentBranch(ctx)).toBe("feature-branch");
	});

	test("returns workflow_run.head_branch for workflow_run event", () => {
		const ctx = makeContext({
			eventName: "workflow_run",
			ref: "refs/heads/main",
			payload: { workflow_run: { head_branch: "wr-branch" } },
		});
		expect(resolveCurrentBranch(ctx)).toBe("wr-branch");
	});

	test("strips refs/heads/ prefix for push event", () => {
		const ctx = makeContext({ eventName: "push", ref: "refs/heads/develop" });
		expect(resolveCurrentBranch(ctx)).toBe("develop");
	});
});

describe("resolveBaseBranch", () => {
	test("returns input override when provided", () => {
		const ctx = makeContext({ eventName: "pull_request" });
		expect(resolveBaseBranch("staging", ctx)).toBe("staging");
	});

	test("returns pull_request.base.ref for PR event", () => {
		const ctx = makeContext({
			eventName: "pull_request",
			payload: { pull_request: { base: { ref: "develop" } } },
		});
		expect(resolveBaseBranch("", ctx)).toBe("develop");
	});

	test("returns workflow_run.head_branch for workflow_run event", () => {
		const ctx = makeContext({
			eventName: "workflow_run",
			payload: { workflow_run: { head_branch: "wr-base" } },
		});
		expect(resolveBaseBranch("", ctx)).toBe("wr-base");
	});

	test("returns main as default when no context available", () => {
		const ctx = makeContext({ eventName: "push", ref: "" });
		expect(resolveBaseBranch("", ctx)).toBe("main");
	});

	test("returns main when workflow_run has no head_branch", () => {
		const ctx = makeContext({
			eventName: "workflow_run",
			payload: { workflow_run: {} },
		});
		expect(resolveBaseBranch("", ctx)).toBe("main");
	});

	test("input override takes precedence over PR payload", () => {
		const ctx = makeContext({
			eventName: "pull_request",
			payload: { pull_request: { base: { ref: "develop" } } },
		});
		expect(resolveBaseBranch("release", ctx)).toBe("release");
	});

	test("strips refs/heads/ prefix for push event", () => {
		const ctx = makeContext({ eventName: "push", ref: "refs/heads/develop" });
		expect(resolveBaseBranch("", ctx)).toBe("develop");
	});
});
