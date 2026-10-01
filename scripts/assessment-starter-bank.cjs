/* eslint-disable @typescript-eslint/no-require-imports */
// Authoring tool only. Never import answer banks into browser code.
const fs = require("node:fs");
const banks = [
  {
    categories: [
      "Web Development",
      "Mobile App Development",
      "Desktop Applications",
      "API Development",
      "Automation",
      "WordPress",
      "Shopify",
      "Cloud Computing",
      "Cybersecurity",
    ],
    questions: [
      [
        "Where should privileged API credentials be stored?",
        "On a protected server",
        "In browser JavaScript",
        "In a public repository",
      ],
      [
        "What should validate authorization for each protected request?",
        "The server",
        "A hidden navigation link",
        "The button color",
      ],
      [
        "What makes a useful regression test?",
        "It detects a previously fixed behavior breaking",
        "It always returns success",
        "It checks only formatting",
      ],
      [
        "What should happen before a destructive production change?",
        "Validate a backup and recovery plan",
        "Disable all logging",
        "Publish credentials",
      ],
      [
        "How should user-provided input be handled?",
        "Validate it at the trust boundary",
        "Trust browser validation alone",
        "Execute it as code",
      ],
      [
        "What reduces accidental exposure in logs?",
        "Redacting credentials and sensitive fields",
        "Logging every password",
        "Making logs public",
      ],
      [
        "What is the purpose of version control?",
        "Track and review changes",
        "Replace all testing",
        "Guarantee zero bugs",
      ],
      [
        "What is a safe retry strategy for a charge-like operation?",
        "Use an idempotency key and reconcile outcomes",
        "Repeat until a success screen appears",
        "Create a new identifier on every retry",
      ],
      [
        "How should an inaccessible interactive control be improved?",
        "Give it an accessible name and keyboard support",
        "Use only a color change",
        "Remove its focus indicator",
      ],
      [
        "When should a dependency update be released?",
        "After compatibility and security checks",
        "Without reading any changes",
        "Only after deleting tests",
      ],
    ],
  },
  {
    categories: [
      "Graphic Design",
      "Logo Design",
      "Brand Identity",
      "UI/UX Design",
      "Illustration",
      "Presentation Design",
      "Print Design",
    ],
    questions: [
      [
        "What should guide the initial design direction?",
        "Audience, goals and agreed brief",
        "Only the designer’s favorite color",
        "An unrelated popular logo",
      ],
      [
        "Which format is generally suitable for a scalable logo master?",
        "Vector artwork",
        "A small screenshot",
        "A compressed thumbnail",
      ],
      [
        "What helps establish visual hierarchy?",
        "Intentional contrast, spacing and type scale",
        "Making every element equally prominent",
        "Using every available font",
      ],
      [
        "Why check text contrast?",
        "To improve readability and accessibility",
        "To make files larger",
        "To replace proofreading",
      ],
      [
        "What should a print handoff confirm?",
        "Printer specifications, bleed and color requirements",
        "Only social media dimensions",
        "Only the file name",
      ],
      [
        "How should third-party artwork be used?",
        "With a license covering the intended use",
        "Without checking rights",
        "By removing a watermark",
      ],
      [
        "What is a useful prototype test?",
        "Observe users completing relevant tasks",
        "Ask only whether the designer likes it",
        "Count decorative elements",
      ],
      [
        "What supports consistency across a brand?",
        "Reusable typography, colors and components",
        "Different rules on every page",
        "Unspecified spacing",
      ],
      [
        "How should feedback be handled?",
        "Clarify the goal and revise against the brief",
        "Ignore all feedback",
        "Change everything without discussion",
      ],
      [
        "What belongs in a professional handoff?",
        "Agreed exports, editable sources and usage guidance",
        "Only a low-resolution preview",
        "Unlicensed source assets",
      ],
    ],
  },
  {
    categories: [
      "2D Animation",
      "3D Animation",
      "Explainer Videos",
      "Intro & Outro",
      "Motion Graphics",
      "Short-form Content",
      "Video Editing",
      "Visual Effects",
    ],
    questions: [
      [
        "What should be approved before detailed production?",
        "A concept, script or storyboard appropriate to the project",
        "Only the export file name",
        "Unrelated stock footage",
      ],
      [
        "What describes frame rate?",
        "Frames displayed per second",
        "Pixels in a frame",
        "Audio volume",
      ],
      [
        "What does easing control?",
        "How motion accelerates or decelerates",
        "File ownership",
        "Subtitle language",
      ],
      [
        "Why use a storyboard?",
        "Plan sequence and visual communication",
        "Replace every revision",
        "Guarantee rendering speed",
      ],
      [
        "What should export settings match?",
        "The agreed delivery platform and specifications",
        "An arbitrary maximum bitrate",
        "The editor’s desktop wallpaper",
      ],
      [
        "What prevents distorted images when resizing?",
        "Preserving the intended aspect ratio",
        "Stretching each axis independently",
        "Changing the audio sample rate",
      ],
      [
        "What improves readable captions?",
        "Accurate timing, contrast and safe placement",
        "Tiny text at the frame edge",
        "Unrelated automatic text",
      ],
      [
        "How should licensed music be selected?",
        "Check permitted uses and distribution",
        "Assume online availability grants rights",
        "Remove the creator’s name",
      ],
      [
        "What should be checked before final delivery?",
        "Playback, sync, artifacts and requested specifications",
        "Only the folder name",
        "Only the first frame",
      ],
      [
        "What helps keep revisions manageable?",
        "Named versions and agreed review checkpoints",
        "Overwriting the only source file",
        "Deleting feedback",
      ],
    ],
  },
  {
    categories: [
      "Audio Editing",
      "Music Production",
      "Podcast Editing",
      "Sound Design",
      "Voice Over",
    ],
    questions: [
      [
        "What is digital clipping?",
        "Signal peaks exceeding the available level",
        "A quieter recording",
        "A longer file name",
      ],
      [
        "What is a sensible recording practice?",
        "Leave headroom and monitor levels",
        "Record permanently above clipping",
        "Disable monitoring throughout",
      ],
      [
        "What does an equalizer change?",
        "Levels in frequency ranges",
        "Copyright ownership",
        "The spoken language",
      ],
      [
        "What is the purpose of a crossfade at an edit?",
        "Smooth the transition between clips",
        "Increase the sample rate",
        "Remove the need to listen",
      ],
      [
        "How should noise reduction be applied?",
        "Carefully while checking for artifacts",
        "At maximum strength on every file",
        "Without auditioning the result",
      ],
      [
        "Which file is suitable as an uncompressed audio master?",
        "WAV",
        "A screenshot",
        "A text document",
      ],
      [
        "What should loudness targets follow?",
        "The client and delivery platform specifications",
        "The loudest possible setting",
        "The length of the filename",
      ],
      [
        "What helps maintain natural speech edits?",
        "Preserving sensible pauses and context",
        "Removing every breath indiscriminately",
        "Randomly moving words",
      ],
      [
        "What must be checked for third-party samples?",
        "Usage rights and license terms",
        "Only download speed",
        "Only file size",
      ],
      [
        "What belongs in final audio quality control?",
        "Listen through for noise, edits, levels and sync",
        "Check only the cover image",
        "Deliver without playback",
      ],
    ],
  },
  {
    categories: [
      "Blog Writing",
      "Content Writing",
      "Copywriting",
      "Technical Writing",
      "Proofreading",
      "Resume Writing",
      "Translation",
    ],
    questions: [
      [
        "What should be established before drafting?",
        "Audience, purpose, scope and tone",
        "An arbitrary word count only",
        "Unverified claims",
      ],
      [
        "How should factual claims be handled?",
        "Verify against reliable relevant sources",
        "Invent plausible details",
        "Copy an unsupported social post",
      ],
      [
        "What is plagiarism?",
        "Presenting another person’s work as your own",
        "Citing a source clearly",
        "Writing an original explanation",
      ],
      [
        "What improves readability?",
        "Clear organization and precise language",
        "Unexplained jargon everywhere",
        "Repeated filler",
      ],
      [
        "How should a quotation be handled?",
        "Preserve meaning and attribute accurately",
        "Change its meaning silently",
        "Invent the source",
      ],
      [
        "What should proofreading primarily check?",
        "Language accuracy and consistency",
        "Only document color",
        "Only file size",
      ],
      [
        "How should confidential client material be treated?",
        "Use it only within authorized scope",
        "Publish it as a sample without consent",
        "Send it to unrelated clients",
      ],
      [
        "What should a translator prioritize?",
        "Meaning, context and appropriate terminology",
        "Word-for-word substitution in every case",
        "Adding unsupported claims",
      ],
      [
        "What makes instructions useful?",
        "Testable steps suited to the reader",
        "Missing prerequisites",
        "Ambiguous sequence",
      ],
      [
        "What should final review compare against?",
        "The brief, accuracy requirements and style guide",
        "Only the writer’s preference",
        "Only a spelling score",
      ],
    ],
  },
  {
    categories: [
      "Digital Marketing",
      "Content Marketing",
      "Email Marketing",
      "SEO",
      "Social Media Marketing",
      "Facebook Ads",
      "Google Ads",
      "Market Research",
    ],
    questions: [
      [
        "What should determine campaign metrics?",
        "The agreed business objective",
        "Only follower count",
        "Whatever number is largest",
      ],
      [
        "What does conversion rate measure?",
        "Conversions divided by the relevant visits or interactions",
        "Total ad spend alone",
        "The number of colors used",
      ],
      [
        "What is an A/B test designed to compare?",
        "Controlled variants against a defined outcome",
        "Unrelated campaigns without controls",
        "Only file sizes",
      ],
      [
        "Why define a target audience?",
        "Align messaging and distribution with likely needs",
        "Guarantee every viewer buys",
        "Avoid research entirely",
      ],
      [
        "What makes a useful campaign report?",
        "Results, context, limitations and next actions",
        "Only vanity metrics",
        "Unsupported guarantees",
      ],
      [
        "What should tracking links use consistently?",
        "A documented campaign naming scheme",
        "Random labels every time",
        "Sensitive personal data",
      ],
      [
        "How should marketing claims be written?",
        "Accurately and with supporting evidence",
        "With guaranteed outcomes without proof",
        "By copying competitors blindly",
      ],
      [
        "What helps assess research quality?",
        "Sampling method, source quality and limitations",
        "Only a large chart",
        "Only attractive formatting",
      ],
      [
        "What should be checked before publishing an ad?",
        "Destination, audience, budget and platform requirements",
        "Only the headline length",
        "Only the author’s name",
      ],
      [
        "What is a responsible optimization decision?",
        "Use sufficient relevant data and documented hypotheses",
        "Change everything after one impression",
        "Ignore the campaign objective",
      ],
    ],
  },
  {
    categories: [
      "Data Analysis",
      "Data Visualization",
      "Data Entry",
      "Machine Learning",
      "AI Chatbots",
      "AI Consulting",
      "Prompt Engineering",
    ],
    questions: [
      [
        "What should happen before analysis?",
        "Check data quality, definitions and permissions",
        "Assume every row is correct",
        "Publish raw personal information",
      ],
      [
        "How should missing values be handled?",
        "Use a documented approach appropriate to the data",
        "Always replace them with zero",
        "Hide all missingness",
      ],
      [
        "What is data leakage in model evaluation?",
        "Using information unavailable at prediction time",
        "Compressing a dataset",
        "Renaming columns",
      ],
      [
        "What does correlation alone establish?",
        "An association, not necessarily causation",
        "A proven causal effect",
        "That all observations are correct",
      ],
      [
        "What makes a chart easier to interpret?",
        "Clear labels, units and appropriate scales",
        "Unlabeled axes",
        "Decorations hiding values",
      ],
      [
        "How should AI-generated factual output be handled?",
        "Verify important claims against reliable evidence",
        "Assume fluency proves correctness",
        "Remove all human review",
      ],
      [
        "How should untrusted text in an AI workflow be treated?",
        "As data, not authority to override system instructions",
        "As permission to expose secrets",
        "As executable commands",
      ],
      [
        "What helps make results reproducible?",
        "Record source versions and transformation steps",
        "Keep only a final screenshot",
        "Delete assumptions",
      ],
      [
        "Why separate training and test data?",
        "Evaluate performance on unseen examples",
        "Make evaluation scores always perfect",
        "Avoid checking errors",
      ],
      [
        "What should a data or AI handoff explain?",
        "Methods, assumptions, limitations and validation",
        "Only an impressive score",
        "Claims unsupported by evaluation",
      ],
    ],
  },
  {
    categories: [
      "Accounting",
      "Bookkeeping",
      "Virtual Assistant",
      "Customer Support",
      "Project Management",
    ],
    questions: [
      [
        "What should define a task’s completion?",
        "Agreed acceptance criteria",
        "Only time spent",
        "The number of messages sent",
      ],
      [
        "How should conflicting records be handled?",
        "Investigate and document reconciliation",
        "Delete one at random",
        "Assume the newest is always correct",
      ],
      [
        "What protects client account access?",
        "Least privilege and approved authentication",
        "Sharing passwords publicly",
        "Using one password for every client",
      ],
      [
        "What should happen when a deadline is at risk?",
        "Communicate early with options and impact",
        "Wait until after it is missed",
        "Hide the task",
      ],
      [
        "How should a change in scope be handled?",
        "Confirm impact and obtain agreement",
        "Promise it without checking capacity",
        "Ignore the original scope",
      ],
      [
        "What supports an audit trail?",
        "Dated records of decisions and changes",
        "Undocumented overwrites",
        "Deleting source evidence",
      ],
      [
        "How should sensitive customer information be shared?",
        "Only with authorized recipients through approved channels",
        "In public comments",
        "With unrelated colleagues",
      ],
      [
        "What makes a useful status update?",
        "Progress, blockers and next steps",
        "Only a vague assurance",
        "Unrelated personal details",
      ],
      [
        "How should an unfamiliar high-impact issue be handled?",
        "Escalate with evidence to the appropriate owner",
        "Guess and conceal uncertainty",
        "Delete the request",
      ],
      [
        "What should a handover include?",
        "Current state, pending items and authorized resources",
        "Only a greeting",
        "Unverified claims of completion",
      ],
    ],
  },
];
module.exports = banks;
if (require.main === module) {
  const file = "supabase/migrations/202609300003_skill_assessments.sql";
  const sql = fs.readFileSync(file, "utf8");
  const seed = `-- STARTER BANK BEGIN: editable foundations; review before publication. No openings are created.
do $seed$ declare bank jsonb; cat record; item jsonb; opts jsonb; questions jsonb; quiz jsonb; correct_id uuid; oid uuid; n integer; idx integer;
begin
 for bank in select value from jsonb_array_elements($bank$${JSON.stringify(banks)}$bank$::jsonb) loop
  for cat in select id,name from public.job_categories where name in(select jsonb_array_elements_text(bank->'categories')) loop
   questions:='[]'; idx:=0;
   for item in select value from jsonb_array_elements(bank->'questions') loop
    opts:='[]'; correct_id:=gen_random_uuid(); idx:=idx+1;
    for n in 0..2 loop
     oid:=case when (n+idx)%3=0 then correct_id else gen_random_uuid() end;
     opts:=opts||jsonb_build_array(jsonb_build_object('id',oid,'text',item->>((n+idx)%3+1)));
    end loop;
    questions:=questions||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'prompt',item->>0,'type','single','points',1,'options',opts,'correctOptionIds',jsonb_build_array(correct_id),'skillIds','[]'::jsonb));
   end loop;
   quiz:=jsonb_build_object('title',cat.name||' Foundations','instructions','Choose the best answer for each question. This is a foundational knowledge assessment, not a practical certification.','passingPercentage',70,'timeLimitMinutes',20,'questions',questions);
   perform public.worksync_validate_skill_quiz(quiz,cat.id);
   insert into public.skill_assessments(category_id,quiz) values(cat.id,quiz) on conflict(category_id) do nothing;
  end loop;
 end loop;
end; $seed$;
-- STARTER BANK END
`;
  fs.writeFileSync(
    file,
    sql
      .replace(/-- STARTER BANK BEGIN[\s\S]*?-- STARTER BANK END\r?\n/, "")
      .replace(
        "notify pgrst,'reload schema';",
        seed + "\nnotify pgrst,'reload schema';",
      ),
  );
  console.log(
    `Prepared ${banks.reduce((n, b) => n + b.categories.length, 0)} category drafts; database unchanged.`,
  );
}
