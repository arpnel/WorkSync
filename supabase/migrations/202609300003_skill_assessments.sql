-- PREPARED, NOT APPLIED. Category knowledge assessments; NEVER updates identity verification.
-- Draft question documents are validated; openings store immutable versioned copies.
begin;
create table if not exists public.skill_assessments (
 assessment_id uuid primary key default gen_random_uuid(),
 category_id uuid not null unique references public.job_categories(id),
 version integer not null default 1 check(version>0),
 quiz jsonb not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.skill_assessment_openings (
 opening_id uuid primary key,
 assessment_id uuid not null references public.skill_assessments(assessment_id),
 category_id uuid not null references public.job_categories(id),
 category_name text not null,
 version integer not null,
 quiz jsonb not null,
 opened_by uuid not null references public."Users"(user_id),
 opened_at timestamptz not null default now(),
 opens_at timestamptz not null,
 closes_at timestamptz not null,
 status text not null default 'open' check(status in ('open','closed')),
 closed_at timestamptz,
 check(closes_at>opens_at)
);
create unique index if not exists skill_assessment_one_open on public.skill_assessment_openings(category_id) where status='open';
create table if not exists public.skill_assessment_eligible (
 opening_id uuid not null references public.skill_assessment_openings(opening_id),
 user_id uuid not null references public."Users"(user_id),
 freelancer_id uuid not null references public.freelancer_profiles(freelancer_id),
 primary key(opening_id,user_id), unique(opening_id,freelancer_id)
);
create index if not exists skill_assessment_eligible_user on public.skill_assessment_eligible(user_id,opening_id);
create table if not exists public.skill_assessment_attempts (
 attempt_id uuid primary key default gen_random_uuid(),
 opening_id uuid not null,
 user_id uuid not null,
 started_at timestamptz not null,
 deadline_at timestamptz not null,
 submitted_at timestamptz,
 status text not null default 'started' check(status in ('started','submitted','expired')),
 answers jsonb not null default '{}',
 earned_points integer,
 available_points integer,
 percentage numeric(6,2),
 passed boolean,
 unique(opening_id,user_id),
 foreign key(opening_id,user_id) references public.skill_assessment_eligible(opening_id,user_id),
 check(earned_points is null or (earned_points>=0 and earned_points<=available_points)),
 check(percentage is null or percentage between 0 and 100)
);
-- Even answerless SELECTs on these tables are denied: access is through safe projections.
do $$ declare t text; begin
 foreach t in array array['skill_assessments','skill_assessment_openings','skill_assessment_eligible','skill_assessment_attempts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end; $$;

create or replace function public.worksync_validate_skill_quiz(p_quiz jsonb,p_category uuid) returns void
language plpgsql set search_path='' as $$
declare q jsonb; opt jsonb; ids text[]:='{}'; option_ids text[]; correct text[]; sid text;
begin
 if jsonb_typeof(p_quiz) is distinct from 'object' or octet_length(p_quiz::text)>200000
 or length(btrim(coalesce(p_quiz->>'title',''))) not between 1 and 160
 or length(coalesce(p_quiz->>'instructions',''))>4000
 or jsonb_typeof(p_quiz->'passingPercentage') is distinct from 'number'
 or (p_quiz->>'passingPercentage')::numeric not between 1 and 100
 or ((p_quiz->>'timeLimitMinutes') is not null and ((p_quiz->>'timeLimitMinutes')::numeric not between 1 and 240 or (p_quiz->>'timeLimitMinutes')::numeric<>trunc((p_quiz->>'timeLimitMinutes')::numeric)))
 or jsonb_typeof(p_quiz->'questions') is distinct from 'array' then raise exception 'Invalid assessment settings' using errcode='22023'; end if;
 if jsonb_array_length(p_quiz->'questions') not between 1 and 50 then raise exception 'Use 1 to 50 questions' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(p_quiz->'questions') loop
  perform (q->>'id')::uuid;
  if q->>'id' is null or (q->>'id')=any(ids) or length(btrim(coalesce(q->>'prompt',''))) not between 1 and 2000
   or coalesce(q->>'type','') not in ('single','multiple','boolean')
   or jsonb_typeof(q->'points') is distinct from 'number' or (q->>'points')::numeric not between 1 and 100 or (q->>'points')::numeric<>trunc((q->>'points')::numeric)
   or jsonb_typeof(q->'options') is distinct from 'array' or jsonb_typeof(q->'correctOptionIds') is distinct from 'array'
   or jsonb_typeof(q->'skillIds') is distinct from 'array' then raise exception 'Invalid question' using errcode='22023'; end if;
  ids:=array_append(ids,q->>'id'); option_ids:='{}';
  if jsonb_array_length(q->'options') not between 2 and 8 then raise exception 'Use 2 to 8 options' using errcode='22023'; end if;
  for opt in select value from jsonb_array_elements(q->'options') loop
   perform (opt->>'id')::uuid;
   if opt->>'id' is null or (opt->>'id')=any(option_ids) or length(btrim(coalesce(opt->>'text',''))) not between 1 and 500 then raise exception 'Invalid answer option' using errcode='22023'; end if;
   option_ids:=array_append(option_ids,opt->>'id');
  end loop;
  select array_agg(value) into correct from jsonb_array_elements_text(q->'correctOptionIds');
  if coalesce(cardinality(correct),0)=0 or not correct <@ option_ids or cardinality(correct)<>(select count(distinct x) from unnest(correct) x)
   or (q->>'type'<>'multiple' and cardinality(correct)<>1) then raise exception 'Select valid correct answers' using errcode='22023'; end if;
  if q->>'type'='boolean' and (cardinality(option_ids)<>2 or
     not exists(select 1 from jsonb_array_elements(q->'options') x where x->>'text'='True') or
     not exists(select 1 from jsonb_array_elements(q->'options') x where x->>'text'='False')) then raise exception 'True/False requires True and False options' using errcode='22023'; end if;
  for sid in select value from jsonb_array_elements_text(q->'skillIds') loop
   if not exists(select 1 from public.category_skills where category_id=p_category and skill_id=sid::uuid) then raise exception 'Skill does not belong to this category' using errcode='22023'; end if;
  end loop;
 end loop;
end; $$;
revoke all on function public.worksync_validate_skill_quiz(jsonb,uuid) from public,anon,authenticated;

create or replace function public.worksync_skill_quiz_public(p_quiz jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('title',p_quiz->'title','instructions',p_quiz->'instructions','passingPercentage',p_quiz->'passingPercentage','timeLimitMinutes',p_quiz->'timeLimitMinutes',
 'questions',(select jsonb_agg(jsonb_build_object('id',q->'id','prompt',q->'prompt','type',q->'type','points',q->'points','options',(select jsonb_agg(jsonb_build_object('id',o->'id','text',o->'text') order by oi) from jsonb_array_elements(q->'options') with ordinality opts(o,oi))) order by qi) from jsonb_array_elements(p_quiz->'questions') with ordinality qs(q,qi)));
$$;
revoke all on function public.worksync_skill_quiz_public(jsonb) from public,anon,authenticated;

create or replace function public.worksync_skill_assessment_admin(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.skill_assessments; o public.skill_assessment_openings; cid uuid; oid uuid; starts timestamptz; ends timestamptz; result jsonb;
begin
 if public.worksync_is_admin() is distinct from true or auth.uid() is null then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('categoryId',c.id,'category',c.name,'assessmentId',a.assessment_id,'version',a.version,'quiz',a.quiz,
   'openings',coalesce((select jsonb_agg(jsonb_build_object('id',x.opening_id,'version',x.version,'openedAt',x.opened_at,'opensAt',x.opens_at,'closesAt',x.closes_at,'closedAt',x.closed_at,'status',case when x.status='closed' or x.closes_at<=now() then 'closed' when x.opens_at>now() then 'scheduled' else 'open' end) order by x.opened_at desc) from public.skill_assessment_openings x where x.category_id=c.id),'[]'::jsonb)) order by c.name),'[]'::jsonb) into result
  from public.job_categories c left join public.skill_assessments a on a.category_id=c.id;
  return result;
 elsif p_action='save' then
  cid:=(p_payload->>'categoryId')::uuid;
  perform 1 from public.job_categories where id=cid for update;
  if not found then raise exception 'Category not found'; end if;
  perform public.worksync_validate_skill_quiz(p_payload->'quiz',cid);
  select * into d from public.skill_assessments where category_id=cid for update;
  if coalesce(d.version,0) is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'Draft changed. Reload before saving.' using errcode='40001'; end if;
  insert into public.skill_assessments(category_id,quiz) values(cid,p_payload->'quiz')
  on conflict(category_id) do update set quiz=excluded.quiz,version=skill_assessments.version+1,updated_at=now() returning * into d;
  return jsonb_build_object('version',d.version);
 elsif p_action in ('eligible','open') then
  cid:=(p_payload->>'categoryId')::uuid;
  perform 1 from public.job_categories where id=cid for update;
  if not found then raise exception 'Category not found'; end if;
  if p_action='eligible' then
   return jsonb_build_object('count',(select count(distinct u.user_id) from public."Users" u join public.freelancer_profiles f using(user_id) join public.freelancer_categories fc using(freelancer_id)
    where fc.category_id=cid and u.role::text='freelancer' and u.created_at<=now()-interval '30 days' and public.worksync_marketplace_active(u.user_id)));
  end if;
  oid:=(p_payload->>'openingId')::uuid;
  select * into o from public.skill_assessment_openings where opening_id=oid;
  if found then
   if o.category_id<>cid or o.opened_by<>auth.uid() then raise exception 'Opening ID conflict'; end if;
   return jsonb_build_object('id',o.opening_id,'reused',true);
  end if;
  select * into d from public.skill_assessments where category_id=cid for update;
  if not found then raise exception 'Save an assessment first'; end if;
  if d.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'Draft changed. Reload before opening.' using errcode='40001'; end if;
  perform public.worksync_validate_skill_quiz(d.quiz,cid);
  starts:=greatest(now(),coalesce((p_payload->>'opensAt')::timestamptz,now())); ends:=(p_payload->>'closesAt')::timestamptz;
  if ends is null or ends<=starts or ends>now()+interval '180 days' then raise exception 'Choose a closing time after opening and within 180 days'; end if;
  update public.skill_assessment_openings set status='closed',closed_at=closes_at where category_id=cid and status='open' and closes_at<=now();
  insert into public.skill_assessment_openings(opening_id,assessment_id,category_id,category_name,version,quiz,opened_by,opens_at,closes_at)
  select oid,d.assessment_id,cid,c.name,d.version,d.quiz,auth.uid(),starts,ends from public.job_categories c where c.id=cid;
  insert into public.skill_assessment_eligible(opening_id,user_id,freelancer_id)
  select oid,u.user_id,f.freelancer_id from public."Users" u join public.freelancer_profiles f using(user_id) join public.freelancer_categories fc using(freelancer_id)
  where fc.category_id=cid and u.role::text='freelancer' and u.created_at<=now()-interval '30 days' and public.worksync_marketplace_active(u.user_id);
  insert into public.notifications(user_id,type,title,message,related_id,is_read)
  select e.user_id,'skill_assessment',c.name||' Skill Assessment Available',
    'A WorkSync '||c.name||' Skill Assessment is available from '||to_char(starts at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC until '||to_char(ends at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC. Complete it to demonstrate category knowledge.',oid,false
  from public.skill_assessment_eligible e join public.job_categories c on c.id=cid where e.opening_id=oid;
  return jsonb_build_object('id',oid,'eligible',(select count(*) from public.skill_assessment_eligible where opening_id=oid));
 elsif p_action='close' then
  update public.skill_assessment_openings set status='closed',closed_at=coalesce(closed_at,now()) where opening_id=(p_payload->>'openingId')::uuid returning * into o;
  if not found then raise exception 'Opening not found'; end if;
  return jsonb_build_object('id',o.opening_id);
 elsif p_action='results' then
  oid:=(p_payload->>'openingId')::uuid;
  select * into o from public.skill_assessment_openings where opening_id=oid;
  if not found then raise exception 'Opening not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',e.user_id,'name',coalesce(p.display_name,'Freelancer'),'startedAt',a.started_at,'submittedAt',a.submitted_at,'percentage',a.percentage,'passed',a.passed,
    'status',case when a.status='submitted' then 'submitted' when a.status='expired' or (a.attempt_id is not null and (o.status='closed' or least(a.deadline_at,o.closes_at)<=now())) then 'expired' when a.attempt_id is null then 'not_started' else 'started' end) order by p.display_name),'[]'::jsonb) into result
   from public.skill_assessment_eligible e left join public.profiles p on p.user_id=e.user_id left join public.skill_assessment_attempts a on a.opening_id=e.opening_id and a.user_id=e.user_id where e.opening_id=oid;
  return jsonb_build_object('openingId',oid,'category',o.category_name,'openedAt',o.opened_at,'closesAt',o.closes_at,'closedAt',o.closed_at,'rows',result);
 end if;
 raise exception 'Unsupported assessment action' using errcode='22023';
end; $$;
revoke all on function public.worksync_skill_assessment_admin(text,jsonb) from public,anon;
grant execute on function public.worksync_skill_assessment_admin(text,jsonb) to authenticated;

create or replace function public.worksync_skill_assessment_member(p_action text,p_opening uuid default null,p_answers jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.skill_assessment_openings; a public.skill_assessment_attempts; q jsonb; val jsonb; k text; selected text[]; correct text[]; options text[]; points integer:=0; total integer:=0; tm timestamptz; qs jsonb; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.opening_id,'category',x.category_name,'openedAt',x.opened_at,'closedAt',x.closed_at,'title',x.quiz->>'title','instructions',x.quiz->>'instructions','version',x.version,'opensAt',x.opens_at,'closesAt',x.closes_at,
   'questionCount',jsonb_array_length(x.quiz->'questions'),'passingPercentage',x.quiz->'passingPercentage','timeLimitMinutes',x.quiz->'timeLimitMinutes','status',case when x.status='closed' or x.closes_at<=now() then 'closed' when x.opens_at>now() then 'scheduled' else 'open' end,
   'attempt',case when t.attempt_id is null then null else jsonb_build_object('id',t.attempt_id,'status',case when t.status='started' and (x.status='closed' or least(t.deadline_at,x.closes_at)<=now()) then 'expired' else t.status end,'startedAt',t.started_at,'deadlineAt',t.deadline_at,'submittedAt',t.submitted_at,'score',t.earned_points,'total',t.available_points,'percentage',t.percentage,'passed',t.passed) end) order by x.opened_at desc),'[]'::jsonb) into result
  from public.skill_assessment_eligible e join public.skill_assessment_openings x using(opening_id) left join public.skill_assessment_attempts t on t.opening_id=x.opening_id and t.user_id=e.user_id where e.user_id=auth.uid();
  return result;
 end if;
 -- Opening row lock serializes starts/submissions with early closure.
 select * into o from public.skill_assessment_openings where opening_id=p_opening for update;
 if not found or not exists(select 1 from public.skill_assessment_eligible where opening_id=p_opening and user_id=auth.uid()) then raise exception 'Assessment unavailable for this account' using errcode='42501'; end if;
 select * into a from public.skill_assessment_attempts where opening_id=p_opening and user_id=auth.uid() for update;
 if p_action not in ('start','save','submit') then raise exception 'Unsupported assessment action'; end if;
 if a.status='submitted' then
  return jsonb_build_object('status','submitted','score',a.earned_points,'total',a.available_points,'percentage',a.percentage,'passed',a.passed,'submittedAt',a.submitted_at);
 end if;
 tm:=clock_timestamp();
 if o.status='closed' or tm>=o.closes_at or a.status='expired' or (a.attempt_id is not null and tm>=a.deadline_at) then
  update public.skill_assessment_attempts set status='expired' where attempt_id=a.attempt_id and status='started';
  return jsonb_build_object('status','expired');
 end if;
 if tm<o.opens_at then raise exception 'Assessment has not opened yet'; end if;
 if public.worksync_marketplace_active(auth.uid()) is distinct from true then raise exception 'Account cannot take assessments' using errcode='42501'; end if;
 if p_action='start' then
  if a.attempt_id is null then
   insert into public.skill_assessment_attempts(opening_id,user_id,started_at,deadline_at)
   values(p_opening,auth.uid(),tm,least(o.closes_at,coalesce(tm+make_interval(mins=>(o.quiz->>'timeLimitMinutes')::integer),o.closes_at))) returning * into a;
  end if;
  return jsonb_build_object('status','started','attemptId',a.attempt_id,'deadlineAt',a.deadline_at,'serverNow',tm,'quiz',public.worksync_skill_quiz_public(o.quiz),'answers',a.answers);
 end if;
 if a.attempt_id is null then raise exception 'Start the assessment first'; end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>30000 then raise exception 'Invalid answers'; end if;
 for k,val in select * from jsonb_each(p_answers) loop
  select value into q from jsonb_array_elements(o.quiz->'questions') where value->>'id'=k;
  if q is null or jsonb_typeof(val) is distinct from 'array' then raise exception 'Invalid question or answers'; end if;
  select coalesce(array_agg(value),'{}') into selected from jsonb_array_elements_text(val);
  select array_agg(value->>'id') into options from jsonb_array_elements(q->'options');
  if not selected <@ options or cardinality(selected)<>(select count(distinct x) from unnest(selected) x) or (q->>'type'<>'multiple' and cardinality(selected)>1) then raise exception 'Invalid selected options'; end if;
 end loop;
 if p_action='save' then
  update public.skill_assessment_attempts set answers=p_answers where attempt_id=a.attempt_id;
  return jsonb_build_object('status','started','serverNow',tm);
 end if;
 for q in select value from jsonb_array_elements(o.quiz->'questions') loop
  total:=total+(q->>'points')::integer;
  select coalesce(array_agg(value),'{}') into selected from jsonb_array_elements_text(coalesce(p_answers->(q->>'id'),'[]'));
  select array_agg(value) into correct from jsonb_array_elements_text(q->'correctOptionIds');
  if selected @> correct and selected <@ correct then points:=points+(q->>'points')::integer; end if;
 end loop;
 -- Exact-set grading, no partial/negative credit. Compare unrounded percentage to threshold.
 update public.skill_assessment_attempts set answers=p_answers,status='submitted',submitted_at=tm,earned_points=points,available_points=total,percentage=round(points*100.0/total,2),passed=(points*100.0/total >= (o.quiz->>'passingPercentage')::numeric) where attempt_id=a.attempt_id returning * into a;
 return jsonb_build_object('status','submitted','score',a.earned_points,'total',a.available_points,'percentage',a.percentage,'passed',a.passed,'submittedAt',a.submitted_at);
end; $$;
revoke all on function public.worksync_skill_assessment_member(text,uuid,jsonb) from public,anon;
grant execute on function public.worksync_skill_assessment_member(text,uuid,jsonb) to authenticated;

-- Only passed results are public professional evidence; failures/answers stay private.
create or replace function public.worksync_skill_assessment_evidence(p_user uuid,p_category uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from (
 select distinct on(o.category_id) o.category_id,o.category_name as category,o.version,a.percentage,a.passed,a.submitted_at as completed_at
 from public.skill_assessment_attempts a join public.skill_assessment_openings o using(opening_id)
 where a.user_id=p_user and a.status='submitted' and a.passed=true and (p_category is null or o.category_id=p_category)
 order by o.category_id,a.submitted_at desc
 ) e;
$$;
revoke all on function public.worksync_skill_assessment_evidence(uuid,uuid) from public;
grant execute on function public.worksync_skill_assessment_evidence(uuid,uuid) to anon,authenticated,service_role;

-- STARTER BANK BEGIN: editable foundations; review before publication. No openings are created.
do $seed$ declare bank jsonb; cat record; item jsonb; opts jsonb; questions jsonb; quiz jsonb; correct_id uuid; oid uuid; n integer; idx integer;
begin
 for bank in select value from jsonb_array_elements($bank$[{"categories":["Web Development","Mobile App Development","Desktop Applications","API Development","Automation","WordPress","Shopify","Cloud Computing","Cybersecurity"],"questions":[["Where should privileged API credentials be stored?","On a protected server","In browser JavaScript","In a public repository"],["What should validate authorization for each protected request?","The server","A hidden navigation link","The button color"],["What makes a useful regression test?","It detects a previously fixed behavior breaking","It always returns success","It checks only formatting"],["What should happen before a destructive production change?","Validate a backup and recovery plan","Disable all logging","Publish credentials"],["How should user-provided input be handled?","Validate it at the trust boundary","Trust browser validation alone","Execute it as code"],["What reduces accidental exposure in logs?","Redacting credentials and sensitive fields","Logging every password","Making logs public"],["What is the purpose of version control?","Track and review changes","Replace all testing","Guarantee zero bugs"],["What is a safe retry strategy for a charge-like operation?","Use an idempotency key and reconcile outcomes","Repeat until a success screen appears","Create a new identifier on every retry"],["How should an inaccessible interactive control be improved?","Give it an accessible name and keyboard support","Use only a color change","Remove its focus indicator"],["When should a dependency update be released?","After compatibility and security checks","Without reading any changes","Only after deleting tests"]]},{"categories":["Graphic Design","Logo Design","Brand Identity","UI/UX Design","Illustration","Presentation Design","Print Design"],"questions":[["What should guide the initial design direction?","Audience, goals and agreed brief","Only the designer’s favorite color","An unrelated popular logo"],["Which format is generally suitable for a scalable logo master?","Vector artwork","A small screenshot","A compressed thumbnail"],["What helps establish visual hierarchy?","Intentional contrast, spacing and type scale","Making every element equally prominent","Using every available font"],["Why check text contrast?","To improve readability and accessibility","To make files larger","To replace proofreading"],["What should a print handoff confirm?","Printer specifications, bleed and color requirements","Only social media dimensions","Only the file name"],["How should third-party artwork be used?","With a license covering the intended use","Without checking rights","By removing a watermark"],["What is a useful prototype test?","Observe users completing relevant tasks","Ask only whether the designer likes it","Count decorative elements"],["What supports consistency across a brand?","Reusable typography, colors and components","Different rules on every page","Unspecified spacing"],["How should feedback be handled?","Clarify the goal and revise against the brief","Ignore all feedback","Change everything without discussion"],["What belongs in a professional handoff?","Agreed exports, editable sources and usage guidance","Only a low-resolution preview","Unlicensed source assets"]]},{"categories":["2D Animation","3D Animation","Explainer Videos","Intro & Outro","Motion Graphics","Short-form Content","Video Editing","Visual Effects"],"questions":[["What should be approved before detailed production?","A concept, script or storyboard appropriate to the project","Only the export file name","Unrelated stock footage"],["What describes frame rate?","Frames displayed per second","Pixels in a frame","Audio volume"],["What does easing control?","How motion accelerates or decelerates","File ownership","Subtitle language"],["Why use a storyboard?","Plan sequence and visual communication","Replace every revision","Guarantee rendering speed"],["What should export settings match?","The agreed delivery platform and specifications","An arbitrary maximum bitrate","The editor’s desktop wallpaper"],["What prevents distorted images when resizing?","Preserving the intended aspect ratio","Stretching each axis independently","Changing the audio sample rate"],["What improves readable captions?","Accurate timing, contrast and safe placement","Tiny text at the frame edge","Unrelated automatic text"],["How should licensed music be selected?","Check permitted uses and distribution","Assume online availability grants rights","Remove the creator’s name"],["What should be checked before final delivery?","Playback, sync, artifacts and requested specifications","Only the folder name","Only the first frame"],["What helps keep revisions manageable?","Named versions and agreed review checkpoints","Overwriting the only source file","Deleting feedback"]]},{"categories":["Audio Editing","Music Production","Podcast Editing","Sound Design","Voice Over"],"questions":[["What is digital clipping?","Signal peaks exceeding the available level","A quieter recording","A longer file name"],["What is a sensible recording practice?","Leave headroom and monitor levels","Record permanently above clipping","Disable monitoring throughout"],["What does an equalizer change?","Levels in frequency ranges","Copyright ownership","The spoken language"],["What is the purpose of a crossfade at an edit?","Smooth the transition between clips","Increase the sample rate","Remove the need to listen"],["How should noise reduction be applied?","Carefully while checking for artifacts","At maximum strength on every file","Without auditioning the result"],["Which file is suitable as an uncompressed audio master?","WAV","A screenshot","A text document"],["What should loudness targets follow?","The client and delivery platform specifications","The loudest possible setting","The length of the filename"],["What helps maintain natural speech edits?","Preserving sensible pauses and context","Removing every breath indiscriminately","Randomly moving words"],["What must be checked for third-party samples?","Usage rights and license terms","Only download speed","Only file size"],["What belongs in final audio quality control?","Listen through for noise, edits, levels and sync","Check only the cover image","Deliver without playback"]]},{"categories":["Blog Writing","Content Writing","Copywriting","Technical Writing","Proofreading","Resume Writing","Translation"],"questions":[["What should be established before drafting?","Audience, purpose, scope and tone","An arbitrary word count only","Unverified claims"],["How should factual claims be handled?","Verify against reliable relevant sources","Invent plausible details","Copy an unsupported social post"],["What is plagiarism?","Presenting another person’s work as your own","Citing a source clearly","Writing an original explanation"],["What improves readability?","Clear organization and precise language","Unexplained jargon everywhere","Repeated filler"],["How should a quotation be handled?","Preserve meaning and attribute accurately","Change its meaning silently","Invent the source"],["What should proofreading primarily check?","Language accuracy and consistency","Only document color","Only file size"],["How should confidential client material be treated?","Use it only within authorized scope","Publish it as a sample without consent","Send it to unrelated clients"],["What should a translator prioritize?","Meaning, context and appropriate terminology","Word-for-word substitution in every case","Adding unsupported claims"],["What makes instructions useful?","Testable steps suited to the reader","Missing prerequisites","Ambiguous sequence"],["What should final review compare against?","The brief, accuracy requirements and style guide","Only the writer’s preference","Only a spelling score"]]},{"categories":["Digital Marketing","Content Marketing","Email Marketing","SEO","Social Media Marketing","Facebook Ads","Google Ads","Market Research"],"questions":[["What should determine campaign metrics?","The agreed business objective","Only follower count","Whatever number is largest"],["What does conversion rate measure?","Conversions divided by the relevant visits or interactions","Total ad spend alone","The number of colors used"],["What is an A/B test designed to compare?","Controlled variants against a defined outcome","Unrelated campaigns without controls","Only file sizes"],["Why define a target audience?","Align messaging and distribution with likely needs","Guarantee every viewer buys","Avoid research entirely"],["What makes a useful campaign report?","Results, context, limitations and next actions","Only vanity metrics","Unsupported guarantees"],["What should tracking links use consistently?","A documented campaign naming scheme","Random labels every time","Sensitive personal data"],["How should marketing claims be written?","Accurately and with supporting evidence","With guaranteed outcomes without proof","By copying competitors blindly"],["What helps assess research quality?","Sampling method, source quality and limitations","Only a large chart","Only attractive formatting"],["What should be checked before publishing an ad?","Destination, audience, budget and platform requirements","Only the headline length","Only the author’s name"],["What is a responsible optimization decision?","Use sufficient relevant data and documented hypotheses","Change everything after one impression","Ignore the campaign objective"]]},{"categories":["Data Analysis","Data Visualization","Data Entry","Machine Learning","AI Chatbots","AI Consulting","Prompt Engineering"],"questions":[["What should happen before analysis?","Check data quality, definitions and permissions","Assume every row is correct","Publish raw personal information"],["How should missing values be handled?","Use a documented approach appropriate to the data","Always replace them with zero","Hide all missingness"],["What is data leakage in model evaluation?","Using information unavailable at prediction time","Compressing a dataset","Renaming columns"],["What does correlation alone establish?","An association, not necessarily causation","A proven causal effect","That all observations are correct"],["What makes a chart easier to interpret?","Clear labels, units and appropriate scales","Unlabeled axes","Decorations hiding values"],["How should AI-generated factual output be handled?","Verify important claims against reliable evidence","Assume fluency proves correctness","Remove all human review"],["How should untrusted text in an AI workflow be treated?","As data, not authority to override system instructions","As permission to expose secrets","As executable commands"],["What helps make results reproducible?","Record source versions and transformation steps","Keep only a final screenshot","Delete assumptions"],["Why separate training and test data?","Evaluate performance on unseen examples","Make evaluation scores always perfect","Avoid checking errors"],["What should a data or AI handoff explain?","Methods, assumptions, limitations and validation","Only an impressive score","Claims unsupported by evaluation"]]},{"categories":["Accounting","Bookkeeping","Virtual Assistant","Customer Support","Project Management"],"questions":[["What should define a task’s completion?","Agreed acceptance criteria","Only time spent","The number of messages sent"],["How should conflicting records be handled?","Investigate and document reconciliation","Delete one at random","Assume the newest is always correct"],["What protects client account access?","Least privilege and approved authentication","Sharing passwords publicly","Using one password for every client"],["What should happen when a deadline is at risk?","Communicate early with options and impact","Wait until after it is missed","Hide the task"],["How should a change in scope be handled?","Confirm impact and obtain agreement","Promise it without checking capacity","Ignore the original scope"],["What supports an audit trail?","Dated records of decisions and changes","Undocumented overwrites","Deleting source evidence"],["How should sensitive customer information be shared?","Only with authorized recipients through approved channels","In public comments","With unrelated colleagues"],["What makes a useful status update?","Progress, blockers and next steps","Only a vague assurance","Unrelated personal details"],["How should an unfamiliar high-impact issue be handled?","Escalate with evidence to the appropriate owner","Guess and conceal uncertainty","Delete the request"],["What should a handover include?","Current state, pending items and authorized resources","Only a greeting","Unverified claims of completion"]]}]$bank$::jsonb) loop
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

notify pgrst,'reload schema';
commit;
