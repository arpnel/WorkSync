export type WorkspaceProjectType = "standard" | "milestone";

export interface WorkspaceMilestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate: string | null;
  status: string;
  displayOrder: number;
}

export interface WorkspaceAgreementItem {
  id: string;
  itemKey: string;
  clientApprovedAt: string | null;
  freelancerApprovedAt: string | null;
}

export interface WorkspaceMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  message: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: string;
  mine: boolean;
}

export interface ProjectWorkspace {
  orderId: string;
  currentUserId: string;
  currentParty: "client" | "freelancer";
  contractId: string | null;
  projectId: string | null;
  conversationId: string | null;
  type: WorkspaceProjectType;
  title: string;
  description: string;
  status: string;
  orderStatus: string;
  clientName: string;
  freelancerName: string;
  createdAt: string;
  startDate: string | null;
  dueDate: string | null;
  budget: number;
  deliveryDays: number | null;
  revisions: number | null;
  terms: string | null;
  contractStatus: string | null;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  milestones: WorkspaceMilestone[];
  agreementItems: WorkspaceAgreementItem[];
  messages: WorkspaceMessage[];
}
