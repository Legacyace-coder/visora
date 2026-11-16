export type AccountRole = "admin" | "photographer" | "agent";

export type PublicAccountRole = Exclude<AccountRole, "admin">;

export type SubmissionStatus =
  | "pending"
  | "processing"
  | "accepted"
  | "rejected";

export interface PhotographerProfile {
  id: string;
  displayName: string;
  role: "photographer";
  referralCode: string;
  referredBy?: string | null;
  referredByAgent?: string | null;
}

export interface AgentProfile {
  id: string;
  displayName: string;
  role: "agent";
  agentCode: string;
}

export interface RegistrationPayload {
  account_type: PublicAccountRole;
  full_name: string;
  display_name: string;
  email: string;
  password: string;
  referral_code?: string | null;
  agent_code?: string | null;
}
