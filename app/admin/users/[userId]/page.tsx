"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPublicProfile } from "@/services/profile/profileservice";
import type { Profile } from "@/types/profile/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
import ReviewsSection from "@/components/profile/ReviewsSection";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
export default function AdminProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  return <AdminProfile key={userId} userId={userId} />;
}
function AdminProfile({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getPublicProfile(userId)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Unable to load profile.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, retry]);
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Profile review"
        description="Review account details within your Admin workspace."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/users">Back to users</Link>
          </Button>
        }
      />
      {loading ? (
        <ContentSkeleton label="Loading profile" variant="profile" />
      ) : !profile ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p role="alert">{error || "Profile not found."}</p>
            <Button
              onClick={() => {
                setLoading(true);
                setError("");
                setProfile(null);
                setRetry(retry + 1);
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-5 pt-6">
              <Avatar className="size-20">
                <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
                <AvatarFallback>
                  {(profile.display_name || profile.first_name || "U").slice(
                    0,
                    2,
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="break-words text-2xl font-semibold">
                  {profile.display_name ||
                    [profile.first_name, profile.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    "User"}
                </h2>
                <p className="text-muted-foreground">{profile.headline}</p>
                <Badge variant="secondary">{profile.role}</Badge>
                <p className="break-all text-xs text-muted-foreground">
                  Account: {profile.user_id}
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>About & account details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="whitespace-pre-wrap break-words text-sm">
                  {profile.bio || "No biography provided."}
                </p>
                <dl className="grid gap-4 text-sm">
                  {Object.entries({
                    Location:
                      profile.location ||
                      [profile.city, profile.province]
                        .filter(Boolean)
                        .join(", "),
                    Verification: profile.verification_status,
                    Joined: profile.created_at
                      ? new Date(profile.created_at).toLocaleDateString()
                      : null,
                    "Hourly rate":
                      profile.hourly_rate == null
                        ? null
                        : "PHP " + profile.hourly_rate.toLocaleString(),
                  }).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-wrap justify-between gap-2 border-b pb-3"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>{value || "Not provided"}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Skills & industries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  ["Skills", profile.skills],
                  ["Industries", profile.industries],
                ].map(([label, items]) => (
                  <div key={label as string}>
                    <h3 className="mb-2 text-sm font-medium">
                      {label as string}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(
                        items as { id: string; name: string }[] | undefined
                      )?.map((item) => (
                        <Badge key={item.id} variant="outline">
                          {item.name}
                        </Badge>
                      ))}
                      {!(items as unknown[] | undefined)?.length && (
                        <p className="text-sm text-muted-foreground">
                          No information available.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <ReviewsSection userId={profile.user_id} role={profile.role} />
        </>
      )}
    </div>
  );
}
