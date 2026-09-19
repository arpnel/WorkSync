// UI fixtures only. Replace these arrays with authorized server data later.
export type RequestStatus = "Pending" | "Approved" | "Rejected";
export interface FinancialRequest {
  id: string;
  user: string;
  userId: string;
  userType: string;
  type: "Cash In" | "Cash Out";
  amount: number;
  method: string;
  date: string;
  duration: string;
  reference: string;
  reason: string;
  status: RequestStatus;
  reviewReason: string;
}
export const financialRequests: FinancialRequest[] = [
  {
    id: "FIN-001",
    user: "John Smith",
    userId: "USR-001",
    userType: "Freelancer",
    type: "Cash Out",
    amount: 1250,
    method: "Bank Transfer",
    date: "April 15, 2026",
    duration: "6 weeks",
    reference: "TXN-001",
    reason: "Project amount withdrawal",
    status: "Pending",
    reviewReason: "",
  },
  {
    id: "FIN-002",
    user: "Alex Johnson",
    userId: "USR-002",
    userType: "Client",
    type: "Cash In",
    amount: 250,
    method: "Bank Transfer",
    date: "April 14, 2026",
    duration: "6 weeks",
    reference: "TXN-002",
    reason: "Project funding",
    status: "Pending",
    reviewReason: "",
  },
];
export interface MonitoredJob {
  id: string;
  title: string;
  client: string;
  freelancer: string;
  budget: number;
  status: "Pending" | "In Progress" | "Completed" | "Rejected";
  date: string;
  location: string;
  duration: string;
  description: string;
}
export const monitoredJobs: MonitoredJob[] = [
  {
    id: "JOB-001",
    title: "Full Stack Web Development",
    client: "Tech Corp",
    freelancer: "John Smith",
    budget: 250,
    status: "Completed",
    date: "March 1, 2026",
    location: "Remote",
    duration: "6 weeks",
    description: "Build a complete e-commerce platform with React.",
  },
];
export interface UserReport {
  id: string;
  reportedUser: string;
  reportedEmail: string;
  reportedUserId: string;
  reporter: string;
  reporterEmail: string;
  reporterId: string;
  reason: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  date: string;
  status: "Pending" | "Under Review" | "Resolved" | "Rejected";
  notes: string;
  action: string;
  evidence: string[];
}
export const userReports: UserReport[] = [
  {
    id: "RP-001",
    reportedUser: "James Wilson",
    reportedEmail: "james.w@example.com",
    reportedUserId: "USR-023",
    reporter: "Sarah Johnson",
    reporterEmail: "sarah.j@example.com",
    reporterId: "USR-045",
    reason: "Unprofessional Behavior",
    description:
      "Failed to deliver the project on time and stopped responding to messages after receiving 50% payment.",
    severity: "High",
    date: "April 15, 2026",
    status: "Pending",
    notes: "",
    action: "",
    evidence: ["chat-screenshot.png", "Contract.pdf"],
  },
];
export interface VerificationRequest {
  id: string;
  user: string;
  userId: string;
  userType: string;
  documentType: string;
  date: string;
  duration: string;
  status: "Pending" | "Approved" | "Declined";
  reason: string;
  notes: string;
  documents: string[];
}
export const verificationRequests: VerificationRequest[] = [
  {
    id: "VER-001",
    user: "Alex Johnson",
    userId: "USR-001",
    userType: "Freelancer",
    documentType: "Government ID",
    date: "March 1, 2026",
    duration: "6 weeks",
    status: "Pending",
    reason: "",
    notes: "",
    documents: ["Driver_license.pdf", "proof_of_address.pdf"],
  },
];
export const formatPeso = (amount: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    amount,
  );
