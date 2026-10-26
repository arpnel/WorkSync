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
    p_id: meeting.meeting_id,
    p_project: projectId,
    p_title: meeting.title,
    p_start: meeting.starts_at,
    p_end: meeting.ends_at,
    p_link: meeting.link,
    p_cancel: status === "cancelled",
  });
}
