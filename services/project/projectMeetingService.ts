import { platformAction } from "@/services/platform/platformService";

export type ProjectMeetingInput = {
  meeting_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  link: string | null;
};

export async function saveProjectMeeting(
  projectId: string,
  meeting: ProjectMeetingInput,
  status: "scheduled" | "cancelled",
) {
  return platformAction("worksync_save_meeting", {
    p_meeting_id: meeting.meeting_id,
    p_project_id: projectId,
    p_starts_at: meeting.starts_at,
    p_ends_at: meeting.ends_at,
    p_status: status,
    p_title: meeting.title,
    p_link: meeting.link,
  });
}
