"use client";

import { useState } from "react";
import type { Profile } from "@/types/profile/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EMPLOYMENT_PREFERENCES,
  ENGLISH_PROFICIENCY,
} from "@/constants/account-setup.constants";

function ProfileTags({
  title,
  items,
  limit,
  unavailable,
}: {
  title: string;
  items: { id: string; name: string }[];
  limit: number;
  unavailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {(expanded ? items : items.slice(0, limit)).map((item) => (
          <Badge
            key={item.id}
            variant="outline"
            className="max-w-full whitespace-normal break-words font-normal"
          >
            {item.name}
          </Badge>
        ))}
        {!items.length && (
          <p className="text-xs text-muted-foreground">
            {unavailable
              ? `${title} could not load.`
              : `No ${title.toLowerCase()} added yet.`}
          </p>
        )}
      </div>
      {items.length > limit && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="min-h-8 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show ${items.length - limit} more`}
        </button>
      )}
    </section>
  );
}

export default function AboutSection({ profile }: { profile: Profile }) {
  const professionalDetails = [
    [
      "Hourly rate",
      profile.hourly_rate != null
        ? `PHP ${profile.hourly_rate.toLocaleString()}/hr`
        : null,
    ],
    [
      "Experience",
      profile.years_of_experience != null
        ? `${profile.years_of_experience} ${profile.years_of_experience === 1 ? "year" : "years"}`
        : null,
    ],
    [
      "Work preference",
      EMPLOYMENT_PREFERENCES.find(
        (option) => option.value === profile.employment_preference,
      )?.label ?? profile.employment_preference,
    ],
    [
      "English",
      ENGLISH_PROFICIENCY.find(
        (option) => option.value === profile.english_proficiency,
      )?.label ?? profile.english_proficiency,
    ],
  ].filter(([, value]) => value);
  const links = [
    ["Website", profile.portfolio_website],
    ["LinkedIn", profile.linkedin_url],
    ["GitHub", profile.github_url],
  ].filter(([, url]) => url && /^https?:\/\//i.test(url));
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">About</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
          {profile.bio || "No introduction added yet."}
        </p>
        {profile.role === "freelancer" && (
          <>
            <section className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-medium">Professional details</h3>
              {professionalDetails.length ? (
                <dl className="space-y-2 text-xs">
                  {professionalDetails.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-wrap justify-between gap-x-3 gap-y-1"
                    >
                      <dt className="shrink-0 text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="min-w-0 break-words font-medium sm:text-right">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No professional details added yet.
                </p>
              )}
            </section>
            <ProfileTags
              title="Skills"
              items={profile.skills ?? []}
              limit={5}
              unavailable={Boolean(
                profile.unavailable_details?.includes("Skills"),
              )}
            />
            <ProfileTags
              title="Industries"
              items={profile.industries ?? []}
              limit={3}
              unavailable={Boolean(
                profile.unavailable_details?.includes("Industries"),
              )}
            />
            {!!links.length && (
              <div className="flex flex-wrap gap-3 text-xs">
                {links.map(([label, url]) => (
                  <a
                    key={label}
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    {label}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Member since{" "}
          {new Date(profile.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
          })}
        </p>
      </CardContent>
    </Card>
  );
}
