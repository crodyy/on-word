// Shared API contracts. Source of truth: PROMPT.md section 8.
// Changes go through the Orchestrator and get logged in LOG.md.

export interface RpSignatureRequest {
  action: string;
}

export interface RpSignatureResponse {
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
}

export interface VerifyProofRequest {
  idkitResponse: unknown;
  wallet: string;
}

export interface VerifyProofSuccess {
  ok: true;
  nullifier: string;
}

export type PostLifetimeDays = 1 | 3 | 5;

export interface CreatePostRequest {
  title: string;
  body: string;
  days: PostLifetimeDays;
}

export interface CreatePostResponse {
  entityKey: string;
}

export interface FeedPost {
  key: string;
  title: string;
  owner: string;
  expiresAt: string;
  commentCount: number;
  expired: boolean;
}

export interface FeedResponse {
  posts: FeedPost[];
  archived: FeedPost[];
}

export interface ExtendPostRequest {
  days: PostLifetimeDays;
}

export interface ExtendPostResponse {
  expiresAt: string;
}

export interface EditPostRequest {
  title?: string;
  body?: string;
}

export interface EditPostResponse {
  ok: true;
}

export interface CreateCommentRequest {
  postKey: string;
  body: string;
}

export interface CreateCommentResponse {
  entityKey: string;
}

export interface ThreadPost {
  key: string;
  title: string;
  body: string;
  owner: string;
  expiresAt: string;
}

export interface ThreadComment {
  key: string;
  author: string;
  body: string;
  expiresAt: string;
}

export interface CommentsResponse {
  comments: ThreadComment[];
}

export type ApiErrorCode =
  | "bad-action"
  | "verify-failed"
  | "worldid-reused"
  | "wallet-reused"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "bad-request";

export interface ApiError {
  error: ApiErrorCode;
}

export interface WorldConfigResponse {
  app_id: `app_${string}`;
  rp_id: string;
  action: string;
  environment: "staging" | "production" | "sandbox";
}

export interface AuthChallengeResponse {
  nonce: string;
  expiresAt: string;
}
