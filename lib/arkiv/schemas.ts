import { addr, bytes, defineSchema, str } from "@arkiv-network/sdk/schema";

// PROMPT.md section 4. Tag must stay unique to this project. Never render
// these tags in the UI; they are storage identifiers, not display data.
export const Posts = defineSchema("human-forum.posts.v1", {
  author: addr().indexed(),
  postKey: str().indexed(),
  title: str(),
  body: bytes(),
});

export const Comments = defineSchema("human-forum.comments.v1", {
  postKey: str().indexed(),
  author: addr().indexed(),
  body: bytes(),
});
