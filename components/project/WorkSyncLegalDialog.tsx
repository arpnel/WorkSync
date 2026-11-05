"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type WorkSyncLegalDocument = "terms" | "privacy";
export type WorkSyncLegalContext = "account" | "contract";

const documents: Record<WorkSyncLegalDocument, { title: string; summary: string; sections: Array<{ heading: string; text: string }> }> = {
  terms: {
    title: "Terms and Conditions",
    summary: "WorkSync · Effective November 2, 2026. Please read before accepting.",
    sections: [
      { heading: "1. Using WorkSync", text: "By creating an account or using WorkSync, you agree to these Terms and applicable laws. You must be legally able to enter into an agreement where you live. Provide accurate account information, keep your sign-in credentials secure, and use only accounts you are authorized to control." },
      { heading: "2. Marketplace relationships", text: "WorkSync provides tools for clients and freelancers to find one another, communicate, make proposals, record project terms, and manage work. Unless a separate written agreement says otherwise, WorkSync is not a party to agreements between users and does not employ, supervise, or act as an agent for clients or freelancers. Each user is responsible for checking the other party, deciding whether to proceed, and complying with laws that apply to their work." },
      { heading: "3. Your listings, proposals, and agreements", text: "Keep listings, profiles, proposals, project plans, milestones, and messages truthful, lawful, and clear. Before work starts, confirm the scope, deliverables, schedule, price, revisions, payment terms, and any other important conditions in the saved contract. Do not misrepresent your identity, qualifications, availability, work, or authority to offer or request a service." },
      { heading: "4. Prohibited conduct and content", text: "You may not use WorkSync to break the law, threaten or harass anyone, promote hatred or discrimination, share another person's private information without authority, impersonate someone, defraud or deceive users, solicit unlawful goods or services, distribute spam or malware, gain unauthorized access, infringe intellectual-property rights, or exploit, endanger, or sexually abuse a child. This also prohibits child sexual abuse material, sexual exploitation, non-consensual intimate content, and instructions or offers to commit serious wrongdoing. Do not use WorkSync to evade sanctions, payment controls, or account restrictions." },
      { heading: "5. Respectful communication and safety", text: "Do not send abusive, hateful, discriminatory, threatening, or sexually harassing messages. Do not pressure users to move transactions off-platform to evade applicable fees, safeguards, or agreed terms. Report suspected abuse, scams, unlawful content, or safety concerns through WorkSync's available support and reporting tools. If someone is in immediate danger, contact local emergency services." },
      { heading: "6. Your content and permissions", text: "You retain rights you have in content you submit. You confirm that you have the rights and permissions needed to submit it. You give WorkSync permission to host, store, reproduce, display, and transmit that content as reasonably needed to operate, secure, and improve the services, show it to the people you choose to interact with, and enforce these Terms. This permission ends when the content is removed, except for copies retained for backups, legal duties, dispute handling, or security." },
      { heading: "7. Payments, fees, and subscriptions", text: "Any platform fees, taxes, plan prices, trial eligibility, payment methods, and refund or cancellation conditions will be presented in the relevant WorkSync flow or payment provider checkout. You authorize a payment only when you confirm it. Premium plan renewal and trial terms are those shown at the time you start or renew a plan. WorkSync may use third-party payment providers; their terms also apply to payment processing." },
      { heading: "8. Moderation and account action", text: "WorkSync may review reports and take reasonable steps when it believes content or conduct violates these Terms, threatens user safety, or creates legal or security risk. Steps may include removing or limiting content, restricting features, suspending or closing an account, preserving relevant records, or reporting matters to authorities when required or permitted by law. WorkSync cannot guarantee that every violation will be detected or removed before users see it." },
      { heading: "9. Service availability and responsibility", text: "WorkSync is provided subject to availability and may change as the service develops. To the extent permitted by law, WorkSync does not guarantee uninterrupted service, a particular business result, a user's identity or ability, or the performance or quality of work arranged between users. Nothing in these Terms excludes rights or liability that cannot legally be excluded. Any limitation of liability applies only to the extent allowed by applicable law." },
      { heading: "10. Changes, suspension, and contact", text: "We may update these Terms and will provide notice of material changes where required. Continued use after an effective change means you accept the revised Terms where the law permits. You may stop using WorkSync and request account assistance through the in-app Help or support channel. These Terms are governed by applicable Philippine law, subject to mandatory consumer and other legal rights and venue rules." },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    summary: "WorkSync · Effective November 2, 2026. Please read before accepting.",
    sections: [
      { heading: "1. Information we process", text: "Depending on how you use WorkSync, this may include account and contact details; profile names, photos, location, skills, and work history; listings, applications, proposals, plans, contracts, messages, and attachments; payment, billing, tax, and verification information you submit; support requests and reports; and technical, device, usage, and security records. Do not include sensitive personal information in a profile, message, or upload unless it is needed for the feature and you are authorized to provide it." },
      { heading: "2. Why we use it", text: "We use information to create and secure accounts; operate profiles, search, listings, applications, messaging, project planning, contracts, payments, and support; verify accounts or documents where a feature requires it; calculate and display plan or transaction information; prevent fraud, abuse, and security incidents; respond to disputes and legal requests; maintain and improve the service; and meet legal, accounting, and regulatory obligations." },
      { heading: "3. Automated and AI-assisted features", text: "Some WorkSync features may use automated tools or AI services to assess skills or organize applicant information. Where used, relevant profile, listing, application, or project information may be processed to generate an assessment or ranking. These outputs are aids and may be incomplete or inaccurate; users should review the underlying information and make their own decisions. Do not submit information about another person unless you have authority to do so." },
      { heading: "4. How information is shared", text: "Information is shared with other users when needed for marketplace activity—for example, a client may see information in a freelancer's application, and conversation participants can see messages and shared files. We may use service providers for hosting, authentication, database and file storage, payment processing, email delivery, security, and AI-assisted features. Those providers process information to provide services to WorkSync. We may also disclose information when required by law, to protect users or rights, investigate suspected fraud or abuse, or handle a business transfer. We do not describe profile or transaction information as confidential when you choose to make it visible to other users." },
      { heading: "5. Retention and security", text: "We retain information for as long as reasonably necessary for the purposes described here, including account operation, contracts and transaction records, disputes, security, backups, and legal obligations. Retention can differ by information type and legal requirement. We use safeguards intended to protect information, but no online service or transmission can be guaranteed completely secure." },
      { heading: "6. Your privacy rights", text: "Subject to applicable law and its exceptions, you may request access to or correction of your personal information, object to or restrict certain processing, request erasure or blocking, request data portability, withdraw consent where consent is the basis, and lodge a complaint with the National Privacy Commission. Some information may need to be retained to complete a transaction, resolve a dispute, protect security, or comply with law." },
      { heading: "7. Children", text: "WorkSync is a professional marketplace and is not intended for children to use independently. Do not create an account or submit a child's personal information unless you have the legal authority and the feature is lawful. Contact WorkSync through in-app Help if you believe a child has submitted personal information." },
      { heading: "8. Updates and privacy contact", text: "We may update this notice when our processing changes or the law requires. We will provide notice of material changes as required. For privacy requests or concerns, contact WorkSync through the in-app Help or support channel so the request can be routed to the person responsible for privacy matters." },
    ],
  },
};

const contractDocuments: typeof documents = {
  terms: {
    title: "WorkSync Contract Terms",
    summary: "These terms apply when clients and freelancers prepare, review, approve, or update project contracts through WorkSync.",
    sections: [
      { heading: "1. Parties and contract formation", text: "The client and freelancer named in a WorkSync contract are the parties to that project agreement. WorkSync provides tools to prepare and record their agreement; it is not itself a party to the work contract unless a separate written agreement expressly says so. Each party is responsible for verifying the other party and deciding whether to enter into the contract." },
      { heading: "2. Review before approval", text: "Before approving, each party must review the saved contract version, including the project scope, deliverables, price and currency, start date, deadline, included revisions, plan, milestones, payment arrangements, and any attached document. An approval confirms agreement to the version shown at that time. Do not approve a version you have not reviewed or do not understand." },
      { heading: "3. Changes and renewed approval", text: "If a party changes an agreed term, plan, milestone, or other material contract detail, the updated version must be shown to the other party and may require both parties to approve again. Check the change summary and current saved version before approving. A prior approval does not mean that you accept a later changed version." },
      { heading: "4. Work and communication", text: "The parties are responsible for completing their agreed obligations, keeping communications professional, and promptly raising concerns through the project conversation or support tools. WorkSync does not guarantee that work will be completed, accepted, paid, or delivered by a particular date. Record changes and important decisions in the project contract or conversation." },
      { heading: "5. Milestones and completion", text: "For milestone projects, the parties should review each deliverable, assigned task, amount, and due date before approving the schedule. Approval of a milestone plan records the agreed allocation and schedule; it does not itself prove that a deliverable has been completed or accepted. Completion and release steps are governed by the applicable WorkSync project flow and payment terms displayed to the parties." },
      { heading: "6. Payments and disputes", text: "Payment obligations, platform fees, taxes, refunds, and release conditions are governed by the saved project terms, applicable WorkSync payment flow, provider terms, and applicable law. Once the client marks a project complete, WorkSync's standard project refund process is no longer available; this does not limit any refund or other remedy required by applicable law. The parties should use WorkSync's available support or dispute process for project concerns. WorkSync may assist with records and platform workflows but does not promise a particular dispute outcome." },
      { heading: "7. Lawful conduct and content", text: "Do not put unlawful, hateful, discriminatory, harassing, threatening, fraudulent, exploitative, infringing, or otherwise abusive terms or content in a project, proposal, message, or attachment. Never use a contract to arrange illegal goods or services, exploit or endanger a child, share non-consensual intimate material, or evade legal obligations. Each party must have the rights and authority needed for the work and materials they provide." },
      { heading: "8. Electronic records and applicable law", text: "WorkSync may keep contract versions, approvals, timestamps, messages, and related records to operate the project flow, support the parties, address disputes, protect the service, and meet legal duties. Electronic records and approvals are subject to applicable law. These terms do not remove rights or remedies that cannot lawfully be waived. Applicable Philippine law governs, subject to mandatory rights and venue rules." },
    ],
  },
  privacy: {
    title: "WorkSync Contract Privacy Notice",
    summary: "This notice explains how information is used in project proposals, contract drafts, approvals, milestones, and related project conversations.",
    sections: [
      { heading: "1. Contract information", text: "WorkSync processes the information needed to prepare and manage a project agreement. This can include client and freelancer names and account identifiers; project descriptions, budgets, schedules, revisions, plan stages and tasks; milestone titles, assignments, amounts and dates; contract documents; approval status and timestamps; and related project messages and attachments." },
      { heading: "2. Uses", text: "We use this information to show each party the proposal and current saved contract, record and display approvals, identify changes that require renewed review, manage project milestones and contract workflows, support users, investigate disputes or misuse, secure the service, and comply with applicable legal and accounting obligations." },
      { heading: "3. Who can see contract information", text: "Contract details are shared with the client and freelancer who are parties to the project and with authorized WorkSync personnel or service providers when needed to operate the workflow, provide support, protect users, or meet legal obligations. Do not include personal or confidential information that is not needed for the project. A party may download or retain information made available to them through the project flow." },
      { heading: "4. Service providers and legal disclosures", text: "WorkSync may rely on providers for hosting, authentication, database and file storage, payment processing, email delivery, security, and AI-assisted features. Providers process information as needed to supply their services. We may disclose relevant contract information when required by law or when reasonably necessary to protect users, investigate suspected fraud or abuse, enforce applicable terms, or resolve a dispute." },
      { heading: "5. Retention and security", text: "We retain contract versions, approvals, communications, and related records for as long as reasonably needed to administer projects, maintain transaction and dispute records, protect the service, and satisfy legal obligations. Retention depends on the record and applicable requirements. Safeguards are used to protect information, but no online system can be guaranteed completely secure." },
      { heading: "6. Your rights and contact", text: "Subject to applicable law and its exceptions, you may request access to or correction of your personal information, object to or restrict certain processing, request erasure or blocking or data portability, withdraw consent where consent is the basis, or lodge a complaint with the National Privacy Commission. Some contract records may need to be retained for legal, transaction, security, or dispute purposes. Contact WorkSync through in-app Help or support for privacy requests." },
    ],
  },
};

export function WorkSyncLegalDialog({ open, onOpenChange, document, onDocumentChange, context = "account" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: WorkSyncLegalDocument;
  onDocumentChange: (document: WorkSyncLegalDocument) => void;
  context?: WorkSyncLegalContext;
}) {
  const selected = (context === "contract" ? contractDocuments : documents)[document];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader
          className={
            context === "account"
              ? "gap-1 rounded-md bg-muted/40 px-4 py-3 pr-10"
              : undefined
          }
        >
          <DialogTitle
            className={context === "account" ? "text-base font-semibold" : undefined}
          >
            {selected.title}
          </DialogTitle>
          <DialogDescription
            className={context === "account" ? "text-xs" : undefined}
          >
            {selected.summary}
          </DialogDescription>
        </DialogHeader>
        <div aria-label="Legal documents" className="flex gap-2 border-b pb-2">
          <button type="button" aria-pressed={document === "terms"} onClick={() => onDocumentChange("terms")} className={`rounded-md px-3 py-2 text-sm ${document === "terms" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{context === "contract" ? "Contract Terms" : "Terms and Conditions"}</button>
          <button type="button" aria-pressed={document === "privacy"} onClick={() => onDocumentChange("privacy")} className={`rounded-md px-3 py-2 text-sm ${document === "privacy" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{context === "contract" ? "Contract Privacy Notice" : "Privacy Policy"}</button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-2 text-sm leading-6">
          {context === "contract" && (
            <p className="text-xs text-muted-foreground">
              Effective November 2, 2026
            </p>
          )}
          {selected.sections.map((section) => (
            <section key={section.heading} className="space-y-1">
              <h3 className="font-semibold leading-5">{section.heading}</h3>
              <p className="text-muted-foreground">{section.text}</p>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
