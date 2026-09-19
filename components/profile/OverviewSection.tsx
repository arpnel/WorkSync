"use client";
import type { Profile } from "@/types/profile/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EMPLOYMENT_PREFERENCES,
  ENGLISH_PROFICIENCY,
} from "@/constants/account-setup.constants";
export default function OverviewSection({ profile }: { profile: Profile }) {
  const unavailable = (name: string) =>
    profile.unavailable_details?.includes(name);
  return (
    <div className="space-y-6">
      {!!profile.unavailable_details?.length && (
        <p
          role="status"
          className="rounded-lg border p-3 text-sm text-muted-foreground"
        >
          Could not load: {profile.unavailable_details.join(", ")}. Other
          profile details are still available. Reload to try again.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          [
            "Services",
            unavailable("Services")
              ? "Not available"
              : (profile.services_count ?? "Not available"),
          ],
          [
            "Portfolio projects",
            unavailable("Portfolio")
              ? "Not available"
              : (profile.portfolio_count ?? "Not available"),
          ],
          [
            "Average rating",
            unavailable("Reviews")
              ? "Not available"
              : profile.rating == null
                ? "No reviews"
                : profile.rating.toFixed(1),
          ],
          [
            "Completed projects",
            unavailable("Projects")
              ? "Not available"
              : profile.projects_completed,
          ],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Professional details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="space-y-3">
              {[
                [
                  "Experience",
                  profile.years_of_experience == null
                    ? "Not specified"
                    : profile.years_of_experience + " years",
                ],
                [
                  "Work preference",
                  EMPLOYMENT_PREFERENCES.find(
                    (option) => option.value === profile.employment_preference,
                  )?.label ??
                    profile.employment_preference ??
                    "Not specified",
                ],
                [
                  "English proficiency",
                  ENGLISH_PROFICIENCY.find(
                    (option) => option.value === profile.english_proficiency,
                  )?.label ?? "Not specified",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-3 border-t pt-4">
              {[
                ["Portfolio website", profile.portfolio_website],
                ["LinkedIn", profile.linkedin_url],
                ["GitHub", profile.github_url],
              ]
                .filter(([, url]) => url && /^https?:\/\//i.test(url))
                .map(([label, url]) => (
                  <a
                    key={label}
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {label}
                  </a>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Skills & industries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <h3 className="mb-2 text-sm font-medium">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills?.length ? (
                  profile.skills.map((skill) => (
                    <Badge key={skill.id} variant="secondary">
                      {skill.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {unavailable("Skills")
                      ? "Skills could not load."
                      : "No skills added yet."}
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Industries</h3>
              <div className="flex flex-wrap gap-2">
                {profile.industries?.length ? (
                  profile.industries.map((industry) => (
                    <Badge key={industry.id} variant="outline">
                      {industry.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {unavailable("Industries")
                      ? "Industries could not load."
                      : "No industries added yet."}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
