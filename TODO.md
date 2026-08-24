# Task: Refactor components/accountsetup into Forms → Sections → Hooks → Services

## Steps
- [x] Read relevant files and understand current structure
- [x] Create plan and get approval
- [x] Create `service/accountSetup.service.ts` (submit functions, placeholder tables)
- [x] Create `service/category.service.ts` (re-export from serviceP)
- [x] Create `hooks/useFileUpload.ts` (reusable file helpers)
- [x] Create `hooks/useClientSetup.ts` (client state/logic)
- [x] Fill `hooks/useFreelancerSetup.ts` (freelancer state/logic)
- [x] Delete empty `hooks/useAccountSetup.ts`
- [x] Generalize `sections/ProfileSection.tsx` (reusable for both forms)
- [x] Generalize `sections/SubmitSection.tsx` (reusable for both forms)
- [x] Update `sections/VerificationSection.tsx` (rename + onFileSelect type)
- [x] Update `sections/FreelancerInformationSection.tsx` (add resume + loading)
- [x] Move `FreelancerIndustrySection` and `FreelancerSkillsSection` into `sections/`
- [x] Refactor `FreelancerSetupForm.tsx` (composition only)
- [x] Refactor `ClientSetupForm.tsx` (composition only)
- [x] Delete empty `SetupSection/` folder and old root section files
- [x] Verify imports && cleanup

## Result
The `components/accountsetup` feature is now cleanly separated into:
- **Forms** → `FreelancerSetupForm.tsx`, `ClientSetupForm.tsx` (composition/UI only)
- **Sections** → `sections/` (each UI section as its own component)
- **Hooks** → `hooks/` (state, form logic, handlers)
- **Services** → `service/` (Supabase/backend operations)
