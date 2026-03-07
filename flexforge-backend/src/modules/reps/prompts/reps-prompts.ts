import { CacheablePrompt } from '../../ai/ai.service';
import { DimensionDef } from '../../ability/dimension-registry';

interface UserContext {
  background?: string;
  target?: string;
  struggle?: string;
  skillLevel?: string;
  previousReps?: number;
}

interface SkillProfileContext {
  summary: string | null; // Pre-formatted dimension averages
  recentFeedback: Array<{
    scenarioTitle: string;
    userFeedback: {
      difficulty: string;
      relevance: string;
      note?: string;
    };
  }>;
}

interface ScenarioTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
}

interface ScenarioBrief {
  managerName: string;
  managerRole: string;
  channel: 'slack' | 'email';
  message: string;
  deadline: string;
  deliverable: string;
}

interface Scenario {
  title: string;
  briefing: string;
  brief?: ScenarioBrief;
  template?: string;
  tasks: ScenarioTask[];
  estimatedMinutes: number;
  difficulty: string;
  skillTags: string[];
}

/**
 * Build prompt for generating 3 practice scenarios
 */
export function buildScenarioGenerationPrompt(
  userContext: UserContext,
  skillName?: string,
  topic?: string,
  profileContext?: SkillProfileContext,
): CacheablePrompt {
  const staticPart = `You are a career coach that creates hands-on practice scenarios. Based on this person's situation, generate exactly 3 practice scenarios that would build the most relevant skills for them RIGHT NOW.

RULES:
- Each scenario must simulate a REAL work task they'd face in their target role
- Tasks should be things they can actually DO right now on their computer (write code, design a system, draft a config, debug a problem, build a pipeline)
- Difficulty should match someone transitioning — challenging but not expert-level
- Make scenarios specific to their background so existing skills are leveraged as a bridge
- The scenario briefing should read like a Slack message from a coworker or a ticket from your lead — not like a textbook exercise
- Each task should be concrete enough that someone can start it without googling "how to start"
- Tasks within a scenario should build on each other (task 2 extends what task 1 produced)
- Generate 3 scenarios at different angles — not just difficulty levels, but different TYPES of work (e.g., debugging vs building vs designing vs migrating)
- Each task needs a unique id (use format: "task-1", "task-2", etc.)
- skillTags should be specific technologies/concepts practiced (3-5 tags per scenario)

CRITICAL — SELF-CONTAINED SCENARIOS:
- The user has NOTHING except a blank editor/terminal. No datasets, no repos, no files, no APIs.
- NEVER reference external files, datasets, repos, or resources the user doesn't have
- If a task involves debugging, include the broken code INLINE in the task description
- If a task involves reviewing/analyzing something, include the artifact INLINE or make the first task to build it
- Every task must be completable with just a text editor, terminal, and internet access

CRITICAL — MAKE EVERY TASK ACTUALLY DOABLE:
Before finalizing each task, ask: "Can a person sitting at a blank laptop actually START and FINISH this in the estimated time?" If not, restructure.

The general fix: when a task is unrealistic as-is, turn it into BUILDING THE TOOL/SYSTEM that makes it doable. The learning is in designing and building — not in manual labor.

Common traps and how to fix them:

1. VOLUME TRAP — "create/write/annotate N items manually"
   BAD: "Write 200 annotated NER samples" / "Create 50 test cases" / "Build a dataset of 100 entries"
   FIX: Task 1 = define the schema/contract with 5-10 examples. Task 2 = build a generator (templates + vocab + randomization) that produces them programmatically. Task 3 = validate a small sample.

2. ACCESS TRAP — task assumes proprietary data, internal systems, or paid services
   BAD: "Analyze your company's internal reports" / "Connect to the production database" / "Use the team's Kubernetes cluster"
   FIX: Task 1 = define the interface/contract (what shape is the data, what does the API return). Task 2 = build realistic mocks/stubs. Task 3 = build the actual logic against those mocks.

3. SCALE TRAP — task requires infrastructure or deployment the user can't do locally
   BAD: "Deploy to AWS and load-test with 10k users" / "Set up a distributed training cluster"
   FIX: Build it locally first. Docker compose or local scripts. Simulate scale with synthetic load. The config/architecture decisions are the real learning.

4. DEPENDENCY TRAP — task requires team members, approvals, or external collaboration
   BAD: "Get code review from a senior engineer" / "Present to stakeholders"
   FIX: Build the artifact (PR description, design doc, presentation), then self-review against a provided rubric or checklist.

5. TIME TRAP — task scope exceeds what's doable in the estimated minutes
   BAD: "Build a full authentication system" in 15 minutes
   FIX: Scope to the hardest decision or most interesting slice. "Design the auth flow and implement the token refresh logic" is doable. "Build all of auth" is not.

6. EXPERTISE TRAP — task requires deep domain knowledge the user is still learning
   BAD: "Write a production-grade Terraform module for a multi-region setup" for someone learning IaC
   FIX: Provide the constraints and a partial example. The task is to extend, adapt, or debug — not to architect from zero with knowledge they don't have yet.

WHAT MAKES A BAD SCENARIO (avoid these):
- Generic textbook exercises ("implement a linked list", "build a todo app")
- Tasks that require no thinking ("install X, then run Y")
- Scenarios that don't connect to their stated goal
- Tasks so vague they cause blank-screen paralysis
- Artificial difficulty (obscure edge cases nobody hits in practice)
- Tasks that reference resources the user doesn't have ("load the dataset", "check the repo", "query the API")
- Asking the user to hand-produce large volumes of anything — the learning is in building the system, not manual labor
- Assuming access to paid services, internal tools, or proprietary data

WHAT MAKES A GOOD SCENARIO:
- Feels like something that would actually land in your inbox at work
- Leverages what they already know while stretching into what they need to learn
- Has clear success criteria (they know when they're done)
- Tasks are specific enough to start immediately but open enough to require real thinking
- Builds muscle memory for the actual day-to-day of their target role
- FULLY SELF-CONTAINED — the user can start with nothing and complete everything
- When something is needed (data, infra, dependencies), the user BUILDS THE TOOLING for it rather than doing it by hand or needing external access

DELIVERABLE-FIRST FORMAT:
Every scenario MUST include a "brief" and "template" in addition to tasks.

The "brief" is a realistic message from a manager/coworker:
- managerName: realistic first-last name
- managerRole: title + relationship (e.g. "Senior PM, your direct manager")
- channel: "slack" or "email"
- message: 3-6 sentences reading like a real message. Specific situation, what's needed, enough context to start. Include numbers, names, dates, constraints.
- deadline: realistic time constraint (e.g. "before the 3pm review")
- deliverable: what the user produces (e.g. "A stakeholder alignment doc")

The "template" is a structured document with [fill in] placeholders:
- Clear section headers in ALL CAPS
- [fill in] or [description] placeholders
- 15-25 lines. Enough structure to guide, not so much it's a form.
- 3-5 sections building logically (situation → analysis → recommendation)

The "tasks" array serves as FOCUS AREAS — guidance text alongside the template, not checkboxes. Each task title describes one aspect of the deliverable.

OUTPUT FORMAT (strict JSON, no markdown, no backticks):
{
  "scenarios": [
    {
      "title": "Short punchy title",
      "briefing": "2-3 sentence real work scenario. Set the scene — who you are, what happened, what needs to be done. Should read like a Slack message from a coworker, not a homework assignment.",
      "brief": {
        "managerName": "Sarah Chen",
        "managerRole": "Senior PM, your direct manager",
        "channel": "slack",
        "message": "3-6 sentence realistic message with specific details, numbers, names, constraints.",
        "deadline": "before the 3pm review",
        "deliverable": "A stakeholder alignment doc"
      },
      "template": "SECTION HEADER\\n[fill in description]\\n\\nSECTION HEADER\\n[fill in description]\\n...",
      "tasks": [
        {
          "id": "task-1",
          "title": "Focus area title",
          "description": "Guidance for this aspect of the deliverable",
          "estimatedMinutes": 10
        }
      ],
      "estimatedMinutes": 25,
      "difficulty": "beginner|intermediate|advanced",
      "skillTags": ["tag1", "tag2", "tag3"]
    }
  ]
}`;

  const dynamicParts: string[] = [];

  dynamicParts.push('THEIR SITUATION:');
  dynamicParts.push(`- Current background: ${userContext.background || 'Not specified'}`);
  dynamicParts.push(`- Want to move toward: ${userContext.target || 'General skill improvement'}`);
  dynamicParts.push(`- Biggest struggle: ${userContext.struggle || 'Not specified'}`);

  if (userContext.skillLevel) {
    dynamicParts.push(`- Familiarity level: ${userContext.skillLevel}`);
  }
  if (skillName) {
    dynamicParts.push(`- Skill to practice: ${skillName}`);
  }
  if (topic) {
    dynamicParts.push(`- Specific topic requested: ${topic}`);
  }
  if (userContext.previousReps !== undefined && userContext.previousReps > 0) {
    dynamicParts.push(`- Previous reps completed: ${userContext.previousReps} — vary the scenario type and angle. Don't repeat similar scenarios.`);
  }

  // Inject skill profile if available (adaptation context)
  if (profileContext?.summary) {
    dynamicParts.push('');
    dynamicParts.push('SKILL PROFILE (from previous reps):');
    dynamicParts.push(profileContext.summary);
  }

  if (profileContext?.recentFeedback && profileContext.recentFeedback.length > 0) {
    dynamicParts.push('');
    dynamicParts.push('USER FEEDBACK FROM RECENT REPS:');
    for (const fb of profileContext.recentFeedback) {
      const parts = [`Rep "${fb.scenarioTitle}": difficulty=${fb.userFeedback.difficulty}, relevance=${fb.userFeedback.relevance}`];
      if (fb.userFeedback.note) parts.push(`note="${fb.userFeedback.note}"`);
      dynamicParts.push(`- ${parts.join(', ')}`);
    }
    dynamicParts.push('');
    dynamicParts.push(`ADAPTATION RULES:
- If user said "too_easy" -> increase complexity. Add more constraints, edge cases, time pressure.
- If user said "too_hard" -> simplify. Focus on core concept, provide more structure in the template.
- If user said "not_relevant" -> shift topic within the current skill area. Read their note for specific direction.
- If user provided a note -> treat it as a direct request. Incorporate their preference into the next scenario.
Generate scenarios that address BOTH the weak skill dimensions AND the user's explicit feedback.`);
  }

  const dynamicPart = `${dynamicParts.join('\n')}\n\nGenerate 3 practice scenarios tailored to this person. Each should leverage their existing background while stretching them toward their target.`;

  return { staticPart, dynamicPart };
}

/**
 * Build prompt for generating 8 multiple-choice quiz questions
 */
export function buildQuizGenerationPrompt(
  userContext: UserContext,
  skillName?: string,
  topic?: string,
  profileContext?: SkillProfileContext,
): CacheablePrompt {
  const staticPart = `You are a career coach that creates knowledge-check quizzes. Based on this person's situation, generate exactly 8 multiple-choice questions to test their understanding of the given skill/topic.

RULES:
- Generate exactly 8 questions total
- Questions 1-4 are "foundational" — test concepts, definitions, "what does X do?", core principles
- Questions 5-8 are "applied" — scenario-based: "given this situation, what would you do?", real-world application
- Each question has exactly 4 options, exactly 1 correct answer
- Each option must include an explanation (shown after answering, explaining why it's right or wrong)
- Questions must be self-contained, unambiguous, and not trick questions
- Applied questions (5-8) must include a "caseStudy" field with realistic context (2-4 sentences setting the scene)
- Options should be plausible — no obviously wrong "joke" answers
- The correct answer should not always be in the same position — randomize it
- Difficulty should match the person's stated skill level and background
- Each question needs a unique id: "q-1" through "q-8"
- Each question needs a "conceptTitle" describing the concept being tested (e.g., "React State Management")

WHAT MAKES A BAD QUIZ QUESTION (avoid):
- Questions with ambiguous or debatable correct answers
- Questions that test trivia nobody uses in practice
- Questions where multiple options are arguably correct
- "All of the above" / "None of the above" options
- Questions that require memorizing exact syntax or version numbers

WHAT MAKES A GOOD QUIZ QUESTION:
- Tests understanding that directly applies to real work
- The wrong answers represent common misconceptions
- Explanations teach something even if the user got it right
- Applied questions feel like real situations they'd face at work
- Questions build on each other thematically (foundational concepts → applying those concepts)

OUTPUT FORMAT (strict JSON, no markdown, no backticks):
{
  "questions": [
    {
      "id": "q-1",
      "level": "foundational",
      "conceptTitle": "Short concept name",
      "question": "The question text?",
      "options": [
        { "text": "Option A", "correct": false, "explanation": "Why this is wrong" },
        { "text": "Option B", "correct": true, "explanation": "Why this is correct" },
        { "text": "Option C", "correct": false, "explanation": "Why this is wrong" },
        { "text": "Option D", "correct": false, "explanation": "Why this is wrong" }
      ]
    },
    {
      "id": "q-5",
      "level": "applied",
      "conceptTitle": "Applying X in practice",
      "question": "Given the situation above, what would you do?",
      "caseStudy": "You're working at a startup and your team lead asks you to...",
      "options": [...]
    }
  ]
}`;

  const dynamicParts: string[] = [];

  dynamicParts.push('THEIR SITUATION:');
  dynamicParts.push(`- Current background: ${userContext.background || 'Not specified'}`);
  dynamicParts.push(`- Want to move toward: ${userContext.target || 'General skill improvement'}`);
  dynamicParts.push(`- Biggest struggle: ${userContext.struggle || 'Not specified'}`);

  if (userContext.skillLevel) {
    dynamicParts.push(`- Familiarity level: ${userContext.skillLevel}`);
  }
  if (skillName) {
    dynamicParts.push(`- Skill to quiz on: ${skillName}`);
  }
  if (topic) {
    dynamicParts.push(`- Specific topic requested: ${topic}`);
  }
  if (userContext.previousReps !== undefined && userContext.previousReps > 0) {
    dynamicParts.push(`- Previous reps completed: ${userContext.previousReps} — vary the question topics. Don't repeat similar questions.`);
  }

  if (profileContext?.summary) {
    dynamicParts.push('');
    dynamicParts.push('SKILL PROFILE (from previous reps):');
    dynamicParts.push(profileContext.summary);
  }

  if (profileContext?.recentFeedback && profileContext.recentFeedback.length > 0) {
    dynamicParts.push('');
    dynamicParts.push('USER FEEDBACK FROM RECENT REPS:');
    for (const fb of profileContext.recentFeedback) {
      const parts = [`Rep "${fb.scenarioTitle}": difficulty=${fb.userFeedback.difficulty}, relevance=${fb.userFeedback.relevance}`];
      if (fb.userFeedback.note) parts.push(`note="${fb.userFeedback.note}"`);
      dynamicParts.push(`- ${parts.join(', ')}`);
    }
    dynamicParts.push('');
    dynamicParts.push(`ADAPTATION RULES:
- If user said "too_easy" -> increase question difficulty. Test deeper concepts and more nuanced applied scenarios.
- If user said "too_hard" -> simplify. Focus on core concepts, less ambiguous scenarios.
- If user said "not_relevant" -> shift topic focus. Read their note for specific direction.
- If user provided a note -> treat it as a direct request. Adjust question topics and difficulty accordingly.
- Focus questions on the user's weakest skill dimensions from their profile.`);
  }

  const dynamicPart = `${dynamicParts.join('\n')}\n\nGenerate 8 quiz questions (4 foundational + 4 applied) tailored to this person's skill level and goals.`;

  return { staticPart, dynamicPart };
}

/**
 * Build prompt for scoring quiz answers and generating feedback
 */
export function buildQuizFeedbackPrompt(
  questions: Array<{
    id: string;
    level: string;
    conceptTitle: string;
    question: string;
    caseStudy?: string;
    options: Array<{ text: string; correct: boolean; explanation: string }>;
  }>,
  answers: Array<{ questionId: string; selectedIndex: number; correct: boolean }>,
  userContext: UserContext,
  dimensions?: DimensionDef[],
  timeSpent?: number,
): CacheablePrompt {
  const dimensionBlock = dimensions && dimensions.length > 0
    ? `Layer 2 — Skill Evaluation:
Score EXACTLY these ${dimensions.length} dimensions (no more, no less):
${dimensions.map(d => `- ${d.id} (${d.label}): ${d.description}`).join('\n')}

For each dimension, provide:
- dimension: the exact dimension id from above (e.g. "${dimensions[0].id}")
- score: 1-5 (1=missing, 2=weak, 3=developing, 4=solid, 5=excellent)
- evidence: reference specific questions they got right or wrong that demonstrate this
- gap: what's missing or could be improved`
    : `Layer 2 — Skill Evaluation (score each 1-5):
Choose 3-5 dimensions most relevant to the quiz topic. For each:
- dimension: name of the skill dimension
- score: 1-5 (1=missing, 2=weak, 3=developing, 4=solid, 5=excellent)
- evidence: reference specific questions they got right or wrong
- gap: what's missing or could be improved`;

  const microLessonBlock = dimensions && dimensions.length > 0
    ? `
Layer 5 — Micro-Lessons (targeted learning for weakest areas):
Generate exactly 2 microLessons targeting the 2 lowest-scoring dimensions. Each lesson should reference specific questions the user got wrong.
- dimensionId: the exact dimension id this lesson targets
- title: short punchy title (e.g. "Why Edge Cases Matter")
- content: 2-3 paragraph micro-lesson teaching the concept they were weakest on. Reference the specific quiz questions they got wrong as examples.
- exercise: one small exercise they can try right now to practice this specific dimension`
    : '';

  const staticPart = `You are an expert learning coach analyzing quiz results and providing detailed feedback.

Given the 8 quiz questions and the user's answers, evaluate their knowledge and provide multi-layered feedback.

FEEDBACK STRUCTURE:

Layer 1 — Quiz Performance:
- completionAnalysis: Score breakdown — how many correct overall, foundational vs applied performance
- timeEfficiency: Was their pace reasonable?
- patternAnalysis: What patterns emerge from their right/wrong answers? Which concepts are strong vs weak?

${dimensionBlock}

Layer 3 — Improvement Plan:
- immediateActions: 1-3 specific things to try RIGHT NOW based on what they got wrong
- conceptsToStudy: topics they should learn to fill gaps revealed by wrong answers
- suggestedNextRep: what their next practice should focus on
- resourceHints: what to search for / what type of material would help (not links)
- methodToImprove: for each weak dimension, a concrete practice technique

Layer 4 — Growth Signal:
- comparedToStart: how this quiz shows progress relative to their stated background
- confidenceCalibration: was their self-assessed confidence accurate vs observed performance?
- encouragement: genuine, specific encouragement tied to something they actually got right
${microLessonBlock}

OUTPUT FORMAT (strict JSON, no markdown):
{
  "execution": {
    "completionAnalysis": "...",
    "timeEfficiency": "...",
    "hintDependency": "..."
  },
  "skillEvaluation": [
    { "dimension": "...", "score": 1-5, "evidence": "...", "gap": "..." }
  ],
  "improvementPlan": {
    "immediateActions": ["..."],
    "conceptsToStudy": ["..."],
    "suggestedNextRep": "...",
    "resourceHints": ["..."],
    "methodToImprove": [{ "dimension": "...", "method": "..." }]
  },
  "growthSignal": {
    "comparedToStart": "...",
    "confidenceCalibration": "...",
    "encouragement": "..."
  },
  "suggestedTopics": ["topic1", "topic2"]${dimensions && dimensions.length > 0 ? `,
  "microLessons": [
    { "dimensionId": "...", "title": "...", "content": "...", "exercise": "..." },
    { "dimensionId": "...", "title": "...", "content": "...", "exercise": "..." }
  ]` : ''}
}`;

  // Build the dynamic part with questions + answers
  const rawScore = answers.filter(a => a.correct).length;
  const total = answers.length;
  const foundationalCorrect = answers.filter(a => {
    const q = questions.find(q => q.id === a.questionId);
    return q?.level === 'foundational' && a.correct;
  }).length;
  const appliedCorrect = answers.filter(a => {
    const q = questions.find(q => q.id === a.questionId);
    return q?.level === 'applied' && a.correct;
  }).length;

  const timeMinutes = timeSpent ? Math.round(timeSpent / 60) : 0;

  const questionDetails = questions.map(q => {
    const answer = answers.find(a => a.questionId === q.id);
    const selectedOption = answer ? q.options[answer.selectedIndex] : null;
    const correctOption = q.options.find(o => o.correct);
    return `Q${q.id.replace('q-', '')} [${q.level}] "${q.conceptTitle}": ${q.question}
${q.caseStudy ? `Case Study: ${q.caseStudy}\n` : ''}User selected: "${selectedOption?.text || 'No answer'}" — ${answer?.correct ? 'CORRECT' : 'WRONG'}
Correct answer: "${correctOption?.text}"`;
  }).join('\n\n');

  const dynamicPart = `QUIZ RESULTS: ${rawScore}/${total} correct (Foundational: ${foundationalCorrect}/4, Applied: ${appliedCorrect}/4)
${timeMinutes > 0 ? `TIME SPENT: ${timeMinutes} minutes` : ''}

QUESTIONS AND ANSWERS:
${questionDetails}

${userContext.background ? `USER BACKGROUND: ${userContext.background}` : ''}
${userContext.target ? `USER GOAL: ${userContext.target}` : ''}
${userContext.struggle ? `USER STRUGGLE: ${userContext.struggle}` : ''}

Provide detailed multi-layer feedback based on their quiz performance. The "hintDependency" field in execution should say "N/A — quiz mode (no hints available)" since this is a quiz, not a scenario.`;

  return { staticPart, dynamicPart };
}

/**
 * Build prompt for progressive hints (3 levels: nudge → hint → walkthrough)
 */
export function buildProgressiveHintPrompt(
  scenario: Scenario,
  task: ScenarioTask,
  hintLevel: number,
  userContext: UserContext,
): CacheablePrompt {
  const staticPart = `You are a senior developer sitting next to a junior who is stuck on a task. You want them to learn, not just copy.

HINT LEVELS:
- Level 1 (Nudge): Point them in the right direction without telling them what to do. Ask a guiding question like "What would happen if you checked X first?" Keep it to 1-2 sentences.
- Level 2 (Hint): Tell them the general approach or the first concrete step, but don't give them the full solution. Like "You'll want to use [specific tool/command/concept] — try looking at [specific thing]." Keep it to 2-3 sentences.
- Level 3 (Walkthrough): Break it into 2-3 mini-steps they can follow, with enough detail to get unstuck. Still don't write the full code/solution for them, but give them the skeleton. Keep it to 4-5 sentences max.

OUTPUT FORMAT (strict JSON, no markdown, no backticks):
{
  "hint": "Your hint text here",
  "encouragement": "One short sentence of genuine encouragement, not patronizing"
}`;

  const isDeliverable = !!scenario.template;

  let dynamicPart: string;
  if (isDeliverable) {
    const focusAreas = scenario.tasks.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join('\n');
    dynamicPart = `THE PERSON:
- Background: ${userContext.background || 'Not specified'}
- Learning toward: ${userContext.target || 'Not specified'}
- Their struggle pattern: ${userContext.struggle || 'Not specified'}
${userContext.skillLevel ? `- Skill level: ${userContext.skillLevel}` : ''}

THE SCENARIO: ${scenario.title}
MANAGER MESSAGE: ${scenario.brief?.message || scenario.briefing}
DELIVERABLE: ${scenario.brief?.deliverable || 'Complete the template'}

TEMPLATE THEY'RE FILLING IN:
${scenario.template}

FOCUS AREAS:
${focusAreas}

HINT LEVEL: ${hintLevel}/3
Provide a level ${hintLevel} hint to help them fill in the template effectively. Reference specific sections or focus areas they should think about.`;
  } else {
    dynamicPart = `THE PERSON:
- Background: ${userContext.background || 'Not specified'}
- Learning toward: ${userContext.target || 'Not specified'}
- Their struggle pattern: ${userContext.struggle || 'Not specified'}
${userContext.skillLevel ? `- Skill level: ${userContext.skillLevel}` : ''}

THE SCENARIO: ${scenario.title} — ${scenario.briefing}
THE SPECIFIC TASK THEY'RE STUCK ON: ${task.title} — ${task.description}

HINT LEVEL: ${hintLevel}/3
Provide a level ${hintLevel} hint for this task.`;
  }

  return { staticPart, dynamicPart };
}

/**
 * Build prompt for multi-layer feedback after completing a rep.
 * Uses fixed dimensions from the dimension registry for consistent scoring.
 */
export function buildRepFeedbackPrompt(
  scenario: Scenario,
  scratchPad: string | null,
  tasksCompleted: string[],
  timeSpent: number,
  hintsUsed: number,
  confidenceScore: number | null,
  userContext: UserContext,
  dimensions?: DimensionDef[],
): CacheablePrompt {
  // Build dimension scoring instructions
  const dimensionBlock = dimensions && dimensions.length > 0
    ? `Layer 2 — Skill Evaluation:
Score EXACTLY these ${dimensions.length} dimensions (no more, no less):
${dimensions.map(d => `- ${d.id} (${d.label}): ${d.description}`).join('\n')}

For each dimension, provide:
- dimension: the exact dimension id from above (e.g. "${dimensions[0].id}")
- score: 1-5 (1=missing, 2=weak, 3=developing, 4=solid, 5=excellent)
- evidence: quote or reference from their work showing this
- gap: what's missing or could be improved`
    : `Layer 2 — Skill Evaluation (score each 1-5):
Choose 3-5 dimensions most relevant to the scenario type. For each:
- dimension: name of the skill dimension
- score: 1-5 (1=missing, 2=weak, 3=developing, 4=solid, 5=excellent)
- evidence: quote or reference from their work showing this
- gap: what's missing or could be improved

Dimension suggestions by type:
Code: correctness, edgeCaseHandling, errorHandling, codeStructure, completeness
AI builder: pipelineDesign, evaluationStrategy, guardrails, operationalThinking, costLatencyTradeoffs
General: conceptualUnderstanding, problemSolvingApproach, practicalApplication, structuralCompleteness, constraintAwareness`;

  // Build micro-lesson instructions
  const microLessonBlock = dimensions && dimensions.length > 0
    ? `
Layer 6 — Micro-Lessons (targeted learning for weakest areas):
Generate exactly 2 microLessons targeting the 2 lowest-scoring dimensions. Each lesson should reference the user's actual work from this rep.
- dimensionId: the exact dimension id this lesson targets
- title: short punchy title (e.g. "Why Edge Cases Matter")
- content: 2-3 paragraph micro-lesson teaching the concept they were weakest on. Use their specific scenario as the example. Show what they did vs. what they should have done.
- exercise: one small exercise they can try right now to practice this specific dimension`
    : '';

  const staticPart = `You are an expert code reviewer and learning coach providing detailed feedback on a practice exercise.

Your feedback must be multi-layered, honest but encouraging, and actionable.

ANALYSIS APPROACH — adapt based on scenario type:
- For deliverable scenarios: Evaluate EACH SECTION of the filled template against what a strong answer would include. Compare the user's filled content to the original placeholders. Check: specificity, relevance to the manager's request, logical flow between sections, actionability.
- For code scenarios: Mentally execute their code. Would it run? Does it produce correct output? Check: correctness, edge cases, error handling, structure, completeness.
- For project scenarios: Evaluate code they wrote for the task. Trace logic with concrete inputs. Flag errors that look right but would break.
- For AI builder scenarios: Evaluate the full pipeline — not just prompt design. Look for eval strategy, guardrails, monitoring, data quality, cost/latency tradeoffs. Reward simplest pipeline that meets requirements.
- For non-code scenarios: Evaluate structural completeness of their artifact. What they omitted reveals more than what they got wrong.

FEEDBACK STRUCTURE:

Layer 1 — Execution Assessment:
- completionAnalysis: Which tasks were done, which skipped, quality of scratch pad notes
- timeEfficiency: Was their time usage reasonable for the difficulty?
- hintDependency: Did they over-rely on hints or push through independently?

${dimensionBlock}

Layer 3 — Improvement Plan:
- immediateActions: 1-3 specific things to try RIGHT NOW
- conceptsToStudy: topics they should learn to fill gaps
- suggestedNextRep: what their next practice should focus on
- resourceHints: what to search for / what type of material would help (not links)
- methodToImprove: for each weak dimension, a concrete practice technique

Layer 4 — Growth Signal:
- comparedToStart: how this rep shows progress relative to their stated background
- confidenceCalibration: was their self-assessed confidence accurate vs observed performance?
- encouragement: genuine, specific encouragement tied to something they actually did well

Layer 5 — Example Answer (deliverable scenarios only):
- exampleAnswer: A fully filled version of the original template showing what a strong, complete answer looks like. Fill every [fill in] placeholder with specific, realistic content that directly addresses the manager's request. Match the tone and depth to the scenario type:
  - Technical scenarios (architecture docs, postmortems, runbooks, design docs): include realistic system names, service names, specific metrics/numbers, code snippets or pseudo-code where appropriate, concrete technical tradeoffs, and real-sounding infrastructure details.
  - Business/PM scenarios (stakeholder docs, project plans, strategy briefs): include realistic stakeholder names, business metrics, timelines, risk assessments, and actionable recommendations.
  - General scenarios: match the professional register of the deliverable type.
  The example should read like something a competent professional actually wrote — not a generic template fill.
${microLessonBlock}

OUTPUT FORMAT (strict JSON, no markdown):
{
  "execution": {
    "completionAnalysis": "...",
    "timeEfficiency": "...",
    "hintDependency": "..."
  },
  "skillEvaluation": [
    { "dimension": "...", "score": 1-5, "evidence": "...", "gap": "..." }
  ],
  "improvementPlan": {
    "immediateActions": ["..."],
    "conceptsToStudy": ["..."],
    "suggestedNextRep": "...",
    "resourceHints": ["..."],
    "methodToImprove": [{ "dimension": "...", "method": "..." }]
  },
  "growthSignal": {
    "comparedToStart": "...",
    "confidenceCalibration": "...",
    "encouragement": "..."
  },
  "suggestedTopics": ["topic1", "topic2"],
  "exampleAnswer": "The full template with all placeholders filled with strong example content (deliverable scenarios only, omit for non-deliverable)"${dimensions && dimensions.length > 0 ? `,
  "microLessons": [
    { "dimensionId": "...", "title": "...", "content": "...", "exercise": "..." },
    { "dimensionId": "...", "title": "...", "content": "...", "exercise": "..." }
  ]` : ''}
}`;

  const totalTasks = scenario.tasks.length;
  const completedCount = tasksCompleted.length;
  const timeMinutes = Math.round(timeSpent / 60);
  const isDeliverable = !!scenario.template;

  let dynamicPart: string;

  if (isDeliverable) {
    const focusAreas = scenario.tasks.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join('\n');
    dynamicPart = `SCENARIO: ${scenario.title}
DIFFICULTY: ${scenario.difficulty}
MANAGER MESSAGE: ${scenario.brief?.message || scenario.briefing}
DELIVERABLE REQUESTED: ${scenario.brief?.deliverable || 'Complete the template'}
DEADLINE CONTEXT: ${scenario.brief?.deadline || 'Not specified'}

ORIGINAL TEMPLATE (with placeholders):
${scenario.template}

FOCUS AREAS:
${focusAreas}

USER'S FILLED TEMPLATE:
${scratchPad || '(empty — user did not fill in the template)'}

TIME SPENT: ${timeMinutes} minutes (estimated: ${scenario.estimatedMinutes} min)
HINTS USED: ${hintsUsed}/3
${confidenceScore ? `SELF-ASSESSED CONFIDENCE: ${confidenceScore}/5` : ''}

${userContext.background ? `USER BACKGROUND: ${userContext.background}` : ''}
${userContext.target ? `USER GOAL: ${userContext.target}` : ''}
${userContext.struggle ? `USER STRUGGLE: ${userContext.struggle}` : ''}

Evaluate each section of the filled template. Compare against what a strong answer would include for each placeholder. Provide detailed multi-layer feedback.`;
  } else {
    dynamicPart = `SCENARIO: ${scenario.title}
DIFFICULTY: ${scenario.difficulty}
BRIEFING: ${scenario.briefing}

TASKS:
${scenario.tasks.map((t, i) => `${i + 1}. [${tasksCompleted.includes(t.id) ? 'COMPLETED' : 'SKIPPED'}] ${t.title}: ${t.description}`).join('\n')}

COMPLETION: ${completedCount}/${totalTasks} tasks completed
TIME SPENT: ${timeMinutes} minutes (estimated: ${scenario.estimatedMinutes} min)
HINTS USED: ${hintsUsed}/3
${confidenceScore ? `SELF-ASSESSED CONFIDENCE: ${confidenceScore}/5` : ''}

USER'S SCRATCH PAD NOTES:
${scratchPad || '(empty — user did not take notes)'}

${userContext.background ? `USER BACKGROUND: ${userContext.background}` : ''}
${userContext.target ? `USER GOAL: ${userContext.target}` : ''}
${userContext.struggle ? `USER STRUGGLE: ${userContext.struggle}` : ''}

Provide detailed multi-layer feedback for this practice session.`;
  }

  return { staticPart, dynamicPart };
}
