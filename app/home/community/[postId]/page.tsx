import { CommunityPostDetail } from "@/components/community/CommunityPostDetail";

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <CommunityPostDetail postId={postId} />;
}
