import { supabase } from "@/lib/supabaseClient";
import { getPublicIdentities, identityName, type PublicIdentity } from "@/services/profile/publicIdentityService";

export type CommunityCategory = "question" | "discussion" | "tips" | "general";
export type CommunitySort = "latest" | "liked" | "discussed";
export type CommunityImage = { image_id: string; object_path: string; url: string };
export type CommunityPost = {
  post_id: string;
  author_id: string;
  category: CommunityCategory;
  title: string;
  body: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  accepted_answer_comment_id: string | null;
  created_at: string;
  updated_at: string;
  author: PublicIdentity | undefined;
  role: "client" | "freelancer" | undefined;
  images: CommunityImage[];
  liked: boolean;
  bookmarked: boolean;
};
export type CommunityComment = {
  comment_id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  author: PublicIdentity | undefined;
  role: "client" | "freelancer" | undefined;
};

type PostRow = Omit<CommunityPost, "author" | "role" | "images" | "liked" | "bookmarked"> & {
  community_post_images: { image_id: string; object_path: string }[];
};
const IMAGE_LIMIT = 4;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("Sign in to use Community.");
  return user.id;
}

function cleanSearch(search: string) {
  return search.trim().replace(/[%,(){}"\\]/g, " ").replace(/\s+/g, " ").slice(0, 100);
}

async function enrichPosts(rows: PostRow[], userId: string): Promise<CommunityPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((post) => post.post_id);
  const authorIds = [...new Set(rows.map((post) => post.author_id))];
  const imagePaths = rows.flatMap((post) => post.community_post_images.map((image) => image.object_path));
  const [likes, bookmarks, identities, imageUrls] = await Promise.all([
    supabase.from("community_post_likes").select("post_id").eq("user_id", userId).in("post_id", ids),
    supabase.from("community_bookmarks").select("post_id").eq("user_id", userId).in("post_id", ids),
    getPublicIdentities({ userIds: authorIds, includeRole: true }),
    imagePaths.length
      ? supabase.storage.from("community-images").createSignedUrls(imagePaths, 300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (likes.error || bookmarks.error || imageUrls.error)
    throw new Error(likes.error?.message ?? bookmarks.error?.message ?? imageUrls.error?.message);
  const likeIds = new Set((likes.data ?? []).map((item) => item.post_id));
  const savedIds = new Set((bookmarks.data ?? []).map((item) => item.post_id));
  const profileMap = new Map(identities.profiles.map((profile) => [profile.user_id, profile]));
  const roleMap = new Map(identities.roles.map((role) => [role.user_id, role.role]));
  const signedMap = new Map((imageUrls.data ?? []).map((item) => [item.path, item.signedUrl]));
  return rows.map((post) => ({
    ...post,
    author: profileMap.get(post.author_id),
    role: roleMap.get(post.author_id),
    liked: likeIds.has(post.post_id),
    bookmarked: savedIds.has(post.post_id),
    images: post.community_post_images.map((image) => ({
      ...image,
      url: signedMap.get(image.object_path) ?? "",
    })).filter((image) => image.url),
  }));
}

export async function getCommunityFeed(input: {
  category?: CommunityCategory | "all";
  sort?: CommunitySort;
  search?: string;
  savedOnly?: boolean;
  offset?: number;
  limit?: number;
} = {}) {
  const userId = await currentUserId();
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(20, Math.max(1, input.limit ?? 10));
  let query = supabase.from("community_posts")
    .select("post_id,author_id,category,title,body,tags,likes_count,comments_count,accepted_answer_comment_id,created_at,updated_at,community_post_images(image_id,object_path)", { count: "exact" });
  if (input.category && input.category !== "all") query = query.eq("category", input.category);
  const search = cleanSearch(input.search ?? "");
  if (search) query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%,tags.cs.{"${search}"}`);
  if (input.savedOnly) {
    const { data, error } = await supabase.from("community_bookmarks").select("post_id").eq("user_id", userId);
    if (error) throw new Error(error.message);
    const saved = (data ?? []).map((item) => item.post_id);
    if (!saved.length) return { posts: [] as CommunityPost[], total: 0, hasMore: false };
    query = query.in("post_id", saved);
  }
  const sortColumn = input.sort === "liked" ? "likes_count" : input.sort === "discussed" ? "comments_count" : "created_at";
  const { data, error, count } = await query
    .eq("status", "published")
    .order(sortColumn, { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as PostRow[];
  const posts = await enrichPosts(rows, userId);
  return { posts, total: count ?? 0, hasMore: offset + posts.length < (count ?? 0) };
}

export async function getCommunityPost(postId: string) {
  const userId = await currentUserId();
  const { data, error } = await supabase.from("community_posts")
    .select("post_id,author_id,category,title,body,tags,likes_count,comments_count,accepted_answer_comment_id,created_at,updated_at,community_post_images(image_id,object_path)")
    .eq("post_id", postId).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [post] = await enrichPosts([data as unknown as PostRow], userId);
  const { data: comments, error: commentError } = await supabase.from("community_comments")
    .select("comment_id,post_id,author_id,parent_comment_id,body,created_at")
    .eq("post_id", postId).eq("status", "published").order("created_at", { ascending: true }).limit(200);
  if (commentError) throw new Error(commentError.message);
  const authors = [...new Set((comments ?? []).map((comment) => comment.author_id))];
  const identities = await getPublicIdentities({ userIds: authors, includeRole: true });
  const profileMap = new Map(identities.profiles.map((profile) => [profile.user_id, profile]));
  const roleMap = new Map(identities.roles.map((role) => [role.user_id, role.role]));
  return {
    post,
    comments: (comments ?? []).map((comment) => ({
      ...comment,
      author: profileMap.get(comment.author_id),
      role: roleMap.get(comment.author_id),
    })) as CommunityComment[],
    currentUserId: userId,
  };
}

export async function createCommunityPost(input: {
  category: CommunityCategory;
  title: string;
  body: string;
  tags: string[];
  files: File[];
}) {
  const userId = await currentUserId();
  const title = input.title.trim();
  const body = input.body.trim();
  const tags = [...new Set(input.tags.map((tag) => tag.trim().replace(/^#/, "").slice(0, 32)).filter(Boolean))].slice(0, 5);
  if (title.length < 5 || title.length > 160) throw new Error("Title must be 5–160 characters.");
  if (body.length < 10 || body.length > 8000) throw new Error("Post must be 10–8,000 characters.");
  if (input.files.length > IMAGE_LIMIT) throw new Error(`Attach up to ${IMAGE_LIMIT} images.`);
  for (const file of input.files) {
    if (!IMAGE_TYPES.has(file.type) || file.size > IMAGE_MAX_BYTES || file.size <= 0)
      throw new Error("Images must be JPEG, PNG, or WebP and no larger than 5 MB each.");
  }
  const { data: post, error } = await supabase.from("community_posts").insert({
    category: input.category, title, body, tags,
  }).select("post_id").single();
  if (error || !post) throw new Error(error?.message ?? "Post could not be created.");
  const paths: string[] = [];
  try {
    for (const file of input.files) {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${userId}/${post.post_id}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await supabase.storage.from("community-images").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (uploaded.error) throw new Error(uploaded.error.message);
      paths.push(path);
    }
    if (paths.length) {
      const attached = await supabase.from("community_post_images").insert(paths.map((object_path) => ({
        post_id: post.post_id, owner_id: userId, object_path,
      })));
      if (attached.error) throw new Error(attached.error.message);
    }
  } catch (uploadError) {
    if (paths.length) await supabase.storage.from("community-images").remove(paths).catch(() => undefined);
    await supabase.from("community_posts").delete().eq("post_id", post.post_id).eq("author_id", userId);
    throw uploadError;
  }
  return post.post_id as string;
}

export async function updateCommunityPost(postId: string, input: { title: string; body: string; tags: string[] }) {
  const title = input.title.trim();
  const body = input.body.trim();
  const tags = [...new Set(input.tags.map((tag) => tag.trim().replace(/^#/, "").slice(0, 32)).filter(Boolean))].slice(0, 5);
  const { error } = await supabase.from("community_posts").update({ title, body, tags }).eq("post_id", postId);
  if (error) throw new Error(error.message);
}

export async function addCommunityComment(postId: string, body: string, parentCommentId?: string | null) {
  const content = body.trim();
  if (!content || content.length > 3000) throw new Error("Comment must be between 1 and 3,000 characters.");
  const { error } = await supabase.from("community_comments").insert({
    post_id: postId, body: content, parent_comment_id: parentCommentId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateCommunityComment(commentId: string, body: string) {
  const content = body.trim();
  if (!content || content.length > 3000) throw new Error("Comment must be between 1 and 3,000 characters.");
  const { error } = await supabase.from("community_comments").update({ body: content }).eq("comment_id", commentId);
  if (error) throw new Error(error.message);
}

export async function deleteCommunityComment(commentId: string, postId: string) {
  const { data: post } = await supabase.from("community_posts").select("accepted_answer_comment_id").eq("post_id", postId).maybeSingle();
  let removesAcceptedAnswer = post?.accepted_answer_comment_id === commentId;
  if (post?.accepted_answer_comment_id && !removesAcceptedAnswer) {
    const { data: acceptedComment } = await supabase.from("community_comments")
      .select("parent_comment_id").eq("comment_id", post.accepted_answer_comment_id).maybeSingle();
    removesAcceptedAnswer = acceptedComment?.parent_comment_id === commentId;
  }
  if (removesAcceptedAnswer) {
    const cleared = await supabase.from("community_posts").update({ accepted_answer_comment_id: null }).eq("post_id", postId);
    if (cleared.error) throw new Error(cleared.error.message);
  }
  const { error } = await supabase.from("community_comments").delete().eq("comment_id", commentId);
  if (error) throw new Error(error.message);
}

export async function setCommunityLike(postId: string, liked: boolean) {
  const userId = await currentUserId();
  const result = liked
    ? await supabase.from("community_post_likes").insert({ post_id: postId, user_id: userId })
    : await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  if (result.error && !(liked && result.error.code === "23505")) throw new Error(result.error.message);
}

export async function setCommunityBookmark(postId: string, bookmarked: boolean) {
  const userId = await currentUserId();
  const result = bookmarked
    ? await supabase.from("community_bookmarks").insert({ post_id: postId, user_id: userId })
    : await supabase.from("community_bookmarks").delete().eq("post_id", postId).eq("user_id", userId);
  if (result.error && !(bookmarked && result.error.code === "23505")) throw new Error(result.error.message);
}

export async function setAcceptedAnswer(postId: string, commentId: string | null) {
  const { error } = await supabase.from("community_posts").update({ accepted_answer_comment_id: commentId }).eq("post_id", postId);
  if (error) throw new Error(error.message);
}

export async function reportCommunityContent(input: {
  postId?: string;
  commentId?: string;
  reason: "spam" | "harassment" | "inappropriate" | "misleading" | "other";
  explanation: string;
}) {
  const { error } = await supabase.from("community_reports").insert({
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    reason: input.reason,
    explanation: input.explanation.trim().slice(0, 1500),
  });
  if (error?.code === "23505") throw new Error("You already reported this content.");
  if (error) throw new Error(error.message);
}

export async function deleteCommunityPost(postId: string) {
  const userId = await currentUserId();
  const { data: images, error: imageError } = await supabase.from("community_post_images")
    .select("image_id,object_path").eq("post_id", postId).eq("owner_id", userId);
  if (imageError) throw new Error(imageError.message);
  const paths = (images ?? []).map((image) => image.object_path);
  if (paths.length) {
    const { error } = await supabase.storage.from("community-images").remove(paths);
    if (error) throw new Error("Post images could not be removed; the post was kept.");
  }
  const { error } = await supabase.from("community_posts").delete().eq("post_id", postId).eq("author_id", userId);
  if (error) throw new Error(error.message);
}

export function communityAuthorName(profile: PublicIdentity | undefined) {
  return identityName(profile, "WorkSync member");
}
