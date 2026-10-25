# Scope of the System

WorkSync is a web-based marketplace for clients who post jobs or request freelance services, freelancers who offer services and apply for jobs, and administrators who oversee platform operations. It provides discovery, profile management, project collaboration, delivery review, payment workflows, and administrative tools. This document describes functionality represented in the repository; it does not certify that external providers, database changes, scheduled jobs, or production settings are active.

## General Modules

1. **Account Access and Onboarding** - Supports account registration, email and Google sign-in, password recovery, account setup, and role-specific workspace entry. Administrative access is checked separately from client and freelancer roles.
2. **Profiles and Role Switching** - Supports client and freelancer profiles, public profile views, and switching between eligible client and freelancer roles. Profile information can include skills, industries, portfolio items, services, reviews, and assessment evidence as applicable.
3. **Marketplace Discovery** - Supports browsing and filtering service listings and job opportunities, viewing listing details, and discovering client or freelancer profiles according to the active role. Guests can browse public listings; account-based actions require sign-in. Signed-in users can save listings and submit reports about listings.
4. **Notifications** - Presents account, listing, assessment, and project notifications and supports reading notification details and updating read state.
5. **Messaging, Meetings, and Calls** - Supports conversations and real-time project communication, shared message content, project meeting workflows, and in-app calling. Availability depends on the deployed database and calling configuration.
6. **Help and Support** - Provides public help articles and frequently asked questions. Signed-in users can submit support requests from the workspace, and administrators can respond to tickets.
7. **Reports and Feedback** - Supports reporting listings and reviewing or submitting project reviews and ratings where project eligibility requirements are met.

## Freelancer Modules

1. **Professional Profile and Portfolio** - Allows freelancers to maintain profile details, skills, industries, portfolio entries, work preferences, availability, and public profile information.
2. **Identity Verification** - Provides access to the configured external identity-verification flow and displays the verification flow status available to the account.
3. **Services and Listings** - Allows freelancers to create, edit, archive, restore, and manage service offerings, control listing availability, and respond to listing moderation outcomes.
4. **Job Applications** - Allows freelancers to browse jobs, submit applications and proposals, and view application status and any available client screening result.
5. **Projects, Agreements, and Delivery** - Allows freelancers to work in standard or milestone-based project workspaces, review project agreements, submit progress and deliverables, discuss submissions, and respond to revision requests.
6. **Schedule** - Presents project deadlines and meetings and allows freelancers to maintain personal manual deadlines. Manual deadlines are stored in that user's browser and are not synchronized across devices.
7. **Skill Assessments** - Allows eligible freelancers to take available category assessments. Passed results can appear as profile evidence and may be supplied to applicant screening when the job category matches. Assessments are knowledge checks, not practical certifications.
8. **Earnings and Payouts** - Presents payment and payout status and supports payout account management. Transfers depend on configured payment services, server settings, and scheduled settlement processing.
9. **Reviews and Ratings** - Allows eligible freelancers to review clients after completed engagements and view reviews received on their public profile.
10. **Subscription and Usage Information** - Shows plan and listing usage, supports a one-time Premium trial and user-initiated monthly renewals, and displays billing status. Checkout depends on configured payment services and deployed subscription support; renewals are manual and do not charge automatically.
11. **Tax Documents and Declarations** - Allows freelancers to submit annual withholding declarations and allows clients and freelancers to maintain tax documents and view their review status. Document review and tax treatment depend on the matching database changes and configured platform rules.

## Client Modules

1. **Client Profile and Job Listings** - Allows clients to maintain their profile, create, edit, archive, restore, and manage job listings, view their own listings, and view reviews received on their public profile. Clients request freelancer services through service-request workflows; they do not own freelancer service listings.
2. **Freelancer Discovery** - Allows clients to browse freelancer profiles, skills, industries, portfolios, reviews, and passed category assessment evidence when available.
3. **Applications and AI-Assisted Screening** - Allows clients to review job applications and request AI-assisted screening results. The score summarizes evidence alignment for human consideration; it does not automatically hire or reject an applicant. A passed assessment may inform the skills dimension only when it matches the job category; it does not add a fixed score bonus.
4. **Service Requests** - Allows clients to discover freelancer services, submit requests, and manage request status and follow-up.
5. **Projects, Agreements, and Collaboration** - Allows clients to manage projects with selected freelancers, review agreements, communicate, schedule meetings, and track project progress.
6. **Delivery and Milestone Review** - Allows clients to review submitted work, approve deliveries, or request revisions. Clients can enable automatic acceptance for eligible new submissions; automatic approval does not itself authorize a payout. Prepared automation uses the standard project deadline plus a 72-hour grace period and a separate 72-hour review period for each submitted milestone. It queues review emails and in-app reminders and processes overdue unsubmitted milestones through the existing refund worker. `202610250007_project_review_automation.sql` is PREPARED, NOT APPLIED; its RPC version gate prevents the application worker from using the new lifecycle before migration deployment.
7. **Project Schedule** - Presents project deadlines and meetings. Personal manual deadlines remain local to the browser where they were created.
8. **Payments and Refunds** - Supports payment checkout and payment-status workflows for supported projects, with refund-related workflows where available. Completion and refunds depend on payment-provider responses and server-side configuration.
9. **Reviews and Ratings** - Allows clients to review freelancers after eligible completed work and view reviews received on their public profile.
10. **Subscription and Usage Information** - Shows plan and listing usage, supports a one-time Premium trial and user-initiated monthly renewals, and displays billing status. Checkout depends on configured payment services and deployed subscription support; renewals are manual and do not charge automatically.
11. **Tax Documents and Declarations** - Allows clients to submit tax documents and freelancers to submit tax documents and annual withholding declarations, and view review status. Submitted documents do not independently establish a legal tax treatment.

## Admin Modules

1. **Admin Dashboard and Analytics** - Presents administrative summaries, activity trends, and platform analytics.
2. **User and Record Management** - Allows authorized administrators to inspect users and supported records, including jobs, services, and projects.
3. **Listing Moderation** - Provides rule-based and AI-assisted review of submitted job and service listings, with administrator review and supported moderation decisions.
4. **Reports and Disputes** - Provides administrative views for user-submitted reports and project disputes, with evidence and supported resolution actions.
5. **Identity-Verification Review** - Provides access to verification records and the review actions available to administrators.
6. **Skill Assessment Management** - Allows administrators to manage assessment content and openings, review results, and configure audience and account-age eligibility settings where the corresponding database changes are deployed.
7. **Tax Document Review** - Allows administrators to review submitted tax documents and freelancer declarations and record supported decisions. Review status and resulting tax handling depend on deployed database rules.
8. **Financial Monitoring** - Provides administrative views of payment, refund, settlement, payout, and tax receipt records. It is a monitoring and support surface, not unrestricted manual payout execution.
9. **Support Tickets** - Allows administrators to review and respond to user support requests.
10. **Audit History** - Provides access to recorded administrator actions where audit records are available.

## Scope Boundaries and Dependencies

- Repository code and prepared SQL files do not prove that a database migration has been applied or that the production schema matches it. Database-backed features require the matching schema, functions, permissions, and policies.
- Authentication, identity verification, AI screening, AI listing moderation, subscription and project payment checkout, refunds, calls, and payouts depend on external services or server configuration. Their live operation must be verified in the deployed environment.
- AI screening and assessment results are decision-support evidence. They do not guarantee professional ability, work quality, or a hiring outcome.
- A completed verification-provider flow is not by itself a public verified badge. Public verification display requires a confirmed database and policy mapping.
- Automatic delivery acceptance changes the delivery review state under configured rules. It does not bypass payment readiness or guarantee that settlement has completed.
- Personal manual deadlines are browser-local. Project deadlines and meetings use their respective account and project workflows.
- Subscription pages support a one-time Premium trial and user-initiated monthly renewal flows. Checkout depends on configured billing and deployed subscription support; renewals are manual rather than automatic.
- Tax documents, withholding declarations, and generated transaction receipts reflect submitted or saved records. They do not establish legal tax advice or guarantee that a claimed tax treatment is valid.
