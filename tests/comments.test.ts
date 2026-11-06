import { describe, expect, it } from "vitest";
import { MAX_COMMENT_BYTES, validateCommentInput } from "../lib/arkiv/comments";

describe("comment validation", () => {
  it("accepts a normal comment", () => {
    expect(() => validateCommentInput({ postKey: "probe-1", body: "nice post" })).not.toThrow();
  });

  it("rejects empty postKey, empty body, oversize body", () => {
    expect(() => validateCommentInput({ postKey: "", body: "b" })).toThrow();
    expect(() => validateCommentInput({ postKey: "k", body: "" })).toThrow();
    expect(() =>
      validateCommentInput({ postKey: "k", body: "x".repeat(MAX_COMMENT_BYTES + 1) }),
    ).toThrow();
  });
});
