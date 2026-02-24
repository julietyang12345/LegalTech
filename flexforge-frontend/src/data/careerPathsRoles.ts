import { DemoQuizQuestion } from './demoContent';

export type RoleId = 'pm' | 'ba' | 'tpm' | 'product-analyst';

export interface CompanyContext {
  name: string;
  type: string;
  industry: string;
  yourRole: string;
}

export interface ManagerBrief {
  managerName: string;
  managerRole: string;
  channel: 'slack' | 'email';
  message: string;
  deadline: string;
  deliverable: string;
}

export interface TaskHint {
  level: 1 | 2;
  hint: string;
  encouragement: string;
}

export interface DeliverableTask {
  title: string;
  instructions: string;
  template: string;
  templatePlaceholders: string[];
  hints: TaskHint[];
  estimatedMinutes: number;
}

export interface SimulationDebrief {
  exampleDeliverable: string;
  whatSeniorsDoDifferently: string;
  quizQuestion: DemoQuizQuestion;
  signupHook: {
    headline: string;
    valueProps: string[];
    ctaText: string;
  };
}

export interface RoleSimulation {
  id: RoleId;
  role: string;
  company: CompanyContext;
  icon: string;
  colorClass: string;
  estimatedMinutes: number;
  skillTags: string[];
  brief: ManagerBrief;
  task: DeliverableTask;
  debrief: SimulationDebrief;
}

// ---------------------------------------------------------------------------
// 1. PROJECT MANAGER — Nexus Technologies
// ---------------------------------------------------------------------------

const pmSimulation: RoleSimulation = {
  id: 'pm',
  role: 'Project Manager',
  company: {
    name: 'Nexus Technologies',
    type: '200-person B2B SaaS company',
    industry: 'Enterprise project management tools',
    yourRole: 'You are the Junior Project Manager on the Platform team',
  },
  icon: 'Briefcase',
  colorClass: 'brand',
  estimatedMinutes: 5,
  skillTags: ['Stakeholder Management', 'Phased Delivery', 'Tradeoff Analysis'],
  brief: {
    managerName: 'Priya Sharma',
    managerRole: 'Senior PM, your direct manager',
    channel: 'slack',
    message: `Hey — we have a problem. Engineering wants 3 more weeks to rebuild the API layer before we migrate customer data. Sales promised 4 enterprise clients they'd be on the new platform by March 15. VP asked me for a plan by 2pm and I'm stuck in customer calls all morning.

Can you draft a stakeholder alignment doc I can present? Include: what each side wants, the tradeoff, and your recommended approach. Don't pick sides — find the sequence that works for everyone.`,
    deadline: 'by 2pm today',
    deliverable: 'A 1-page stakeholder alignment doc',
  },
  task: {
    title: 'Write the Stakeholder Alignment Doc',
    instructions:
      'Fill in the template below. Capture each side\'s position, the tradeoff, and propose a phased plan that gives everyone part of what they need. The PM move is finding the sequence, not picking the winner.',
    template: `STAKEHOLDER ALIGNMENT — Platform Migration

ENGINEERING POSITION:
What they want: [fill in]
Their reasoning: [fill in]
Risk if we ignore this: [fill in]

SALES POSITION:
What they want: [fill in]
Their reasoning: [fill in]
Risk if we ignore this: [fill in]

THE TRADEOFF:
If we go with Engineering: [what happens]
If we go with Sales: [what happens]

RECOMMENDED APPROACH:
Phase 1 (Weeks 1-3): [what ships and who benefits]
Phase 2 (Weeks 4-6): [what ships and who benefits]

WHY THIS WORKS:
Engineering gets: [fill in]
Sales gets: [fill in]
VP gets: [fill in]`,
    templatePlaceholders: [
      'Engineering — What they want',
      'Engineering — Their reasoning',
      'Engineering — Risk if ignored',
      'Sales — What they want',
      'Sales — Their reasoning',
      'Sales — Risk if ignored',
      'If we go with Engineering',
      'If we go with Sales',
      'Phase 1 (Weeks 1-3)',
      'Phase 2 (Weeks 4-6)',
      'Engineering gets',
      'Sales gets',
      'VP gets',
    ],
    hints: [
      {
        level: 1,
        hint: 'Neither side is wrong. The PM move is finding the sequence, not picking the winner. Can some customers migrate first while the API rebuild continues?',
        encouragement: 'Great PMs don\'t pick winners and losers. They find the sequence that works.',
      },
      {
        level: 2,
        hint: `Here's a strong phased approach:

Phase 1: Migrate the 4 enterprise clients using a direct migration path (Sales happy — clients on new platform by March 15).
Phase 2: Rebuild the API layer for the remaining 200+ accounts (Engineering happy — proper architecture).

VP gets: A board demo with live enterprise data AND a proper long-term architecture plan.

The key insight: the 4 enterprise accounts are a small, well-known dataset. Direct migration risk is low for a small batch. The API rebuild matters for the bulk migration of hundreds of accounts.`,
        encouragement: 'This is the core PM skill: turning a conflict into a sequenced plan where everyone sees their priority addressed.',
      },
    ],
    estimatedMinutes: 4,
  },
  debrief: {
    exampleDeliverable: `STAKEHOLDER ALIGNMENT — Platform Migration

ENGINEERING POSITION:
What they want: 3 additional weeks to rebuild the API layer before any data migration
Their reasoning: Migrating without the new API risks dirty data that takes months to clean up
Risk if we ignore this: Technical debt, data integrity issues, months of post-migration cleanup

SALES POSITION:
What they want: 4 enterprise clients on the new platform by March 15 as promised
Their reasoning: Client commitments are made, Q1 pipeline depends on migration completion
Risk if we ignore this: Lost enterprise deals, damaged client trust, missed revenue targets

THE TRADEOFF:
If we go with Engineering: March 15 deadline missed, Sales loses 4 enterprise deals, client trust damaged
If we go with Sales: Full migration on unfinished API, technical debt across 200+ accounts

RECOMMENDED APPROACH:
Phase 1 (Weeks 1-3): Direct migration of 4 enterprise clients only — small, well-known dataset, low risk of dirty data. Sales meets their March 15 commitment.
Phase 2 (Weeks 4-6): Rebuild API layer and migrate remaining 200+ accounts through it. Engineering gets proper architecture for the bulk migration.

WHY THIS WORKS:
Engineering gets: Their API rebuild for the bulk migration (where it matters most)
Sales gets: 4 enterprise clients on new platform by March 15
VP gets: Board demo with live enterprise data + long-term architecture plan`,
    whatSeniorsDoDifferently:
      'Senior PMs don\'t just present the tradeoff — they come with a recommendation AND a fallback. They also include: "If this plan doesn\'t work, here\'s Plan B." That\'s what separates a PM from a messenger.',
    quizQuestion: {
      question:
        'You are 2 weeks into a 6-week project. Engineering says they need 3 more weeks for a "proper" solution. Sales says the original deadline is non-negotiable. Both escalate to the VP. As the PM, what do you do?',
      options: [
        'Side with engineering — quality matters more than speed. Push the deadline back 3 weeks.',
        'Side with sales — the business commitment was made. Tell engineering to cut corners and ship on time.',
        'Propose a phased delivery: ship the critical 20% that Sales needs by the deadline, then build the full solution in a follow-up sprint. Present the tradeoff data to the VP with your recommendation.',
        'Escalate to the VP and let them make the call — this is above your pay grade.',
      ],
      correctIndex: 2,
      conceptTitle: 'Phased Delivery Beats Binary Choices',
      explanation:
        'The PM trap is thinking this is a binary decision: quality vs speed. It is not. Almost every stakeholder conflict can be resolved by decomposing scope into phases.\n\nSales gets what they need to hit their number (the critical 20%). Engineering gets to build the proper solution (just not all at once). The VP sees a PM who finds solutions instead of escalating problems.\n\nSiding with either team creates a political enemy. Escalating without a recommendation signals you cannot handle the PM role.',
      realWorldContext:
        'At companies like Razorpay and PhonePe, PMs are explicitly evaluated on their ability to "find the MVP within the project." Phased delivery is the standard PM playbook for timeline pressure.',
    },
    signupHook: {
      headline: 'You just created a real PM deliverable.',
      valueProps: [
        '7-day PM curriculum personalized to YOUR background',
        'Practice stakeholder alignment, sprint planning, and VP communication',
        'Build a portfolio of PM work samples you can show in interviews',
      ],
      ctaText: 'Get Your PM Curriculum — Free',
    },
  },
};

// ---------------------------------------------------------------------------
// 2. BUSINESS ANALYST — Finova Payments
// ---------------------------------------------------------------------------

const baSimulation: RoleSimulation = {
  id: 'ba',
  role: 'Business Analyst',
  company: {
    name: 'Finova Payments',
    type: '150-person fintech startup',
    industry: 'Digital payments processing (₹500Cr monthly)',
    yourRole: 'You are the Junior Business Analyst on the Product team',
  },
  icon: 'Search',
  colorClass: 'purple',
  estimatedMinutes: 5,
  skillTags: ['Requirements Discovery', 'Stakeholder Analysis', 'Ambiguity Resolution'],
  brief: {
    managerName: 'Arjun Mehta',
    managerRole: 'Lead BA, your direct manager',
    channel: 'email',
    message: `Subject: Need requirements doc ASAP — crypto payments feature

Hey — the CEO dropped this in the leadership channel this morning: "We need to add crypto payments by Q2." That's all we got. No PRD, no user research.

I just got out of 3 back-to-back calls and each stakeholder thinks it means something different:
• Head of Product: "We need to accept Bitcoin and Ethereum from end users"
• Head of Compliance: "We need a way to audit crypto transactions for regulatory reporting"
• Head of Engineering: "We need to integrate with a crypto payment gateway API"

Before we write a single line of code, I need you to draft a requirements discovery brief. List the questions we need answered before this project can start. Group them by stakeholder. We're meeting at 4pm.`,
    deadline: 'before the 4pm meeting',
    deliverable: 'A requirements discovery brief with questions grouped by stakeholder',
  },
  task: {
    title: 'Write the Requirements Discovery Brief',
    instructions:
      'Fill in the template below with the questions that need answering before this project can start. Think about what each stakeholder needs clarified, and what cross-cutting questions affect everyone.',
    template: `REQUIREMENTS DISCOVERY BRIEF — Crypto Payments Feature

CEO DIRECTIVE: "Add crypto payments by Q2"
STATUS: Requirements undefined. Discovery needed.

QUESTIONS FOR HEAD OF PRODUCT:
1. [fill in]
2. [fill in]
3. [fill in]

QUESTIONS FOR HEAD OF COMPLIANCE:
1. [fill in]
2. [fill in]
3. [fill in]

QUESTIONS FOR HEAD OF ENGINEERING:
1. [fill in]
2. [fill in]
3. [fill in]

CROSS-CUTTING QUESTIONS:
1. [fill in]
2. [fill in]
3. [fill in]`,
    templatePlaceholders: [
      'Product question 1',
      'Product question 2',
      'Product question 3',
      'Compliance question 1',
      'Compliance question 2',
      'Compliance question 3',
      'Engineering question 1',
      'Engineering question 2',
      'Engineering question 3',
      'Cross-cutting question 1',
      'Cross-cutting question 2',
      'Cross-cutting question 3',
    ],
    hints: [
      {
        level: 1,
        hint: 'The biggest BA mistake is asking "what do you want to build?" Start with "who is this for?" and "what problem does it solve?" The solution comes last.',
        encouragement: 'Good BAs structure ambiguity. That\'s exactly what you\'re doing.',
      },
      {
        level: 2,
        hint: `Strong questions to consider:

Product: Who is the target user — end customers, merchants, or internal ops? Which cryptocurrencies? What's the expected transaction volume?

Compliance: Which regulations apply — RBI guidelines, FATF, AML? Do we need separate KYC for crypto? What audit trail format does compliance need?

Engineering: Build vs buy? Can the current payment architecture extend to crypto? Realistic timeline for each option?

Cross-cutting: What does "by Q2" mean — pilot, full rollout, or internal testing? What's the success metric? Is there budget for a third-party gateway?`,
        encouragement: 'Notice how each question uncovers a different assumption. That\'s requirements discovery.',
      },
    ],
    estimatedMinutes: 4,
  },
  debrief: {
    exampleDeliverable: `REQUIREMENTS DISCOVERY BRIEF — Crypto Payments Feature

CEO DIRECTIVE: "Add crypto payments by Q2"
STATUS: Requirements undefined. Discovery needed.

QUESTIONS FOR HEAD OF PRODUCT:
1. Who is the target user? End customers paying with crypto, merchants receiving crypto, or internal treasury ops?
2. Which cryptocurrencies are in scope? Just BTC/ETH or a broader set including stablecoins (USDT, USDC)?
3. What's the expected transaction volume in Q2? This affects architecture decisions significantly.

QUESTIONS FOR HEAD OF COMPLIANCE:
1. Which regulations apply? RBI's latest crypto guidelines, FATF travel rule, AML/KYC requirements?
2. Do we need a separate KYC flow specifically for crypto transactions, or does our existing KYC suffice?
3. What audit trail format does compliance need? Real-time monitoring or batch reporting?

QUESTIONS FOR HEAD OF ENGINEERING:
1. Build vs buy? Custom blockchain integration or a gateway like BitPay/Coinbase Commerce/WazirX?
2. Can the current payment architecture extend to handle crypto, or does this require a new service?
3. What's the realistic engineering timeline for each option (build vs buy)?

CROSS-CUTTING QUESTIONS:
1. What does "by Q2" mean? Pilot launch with select merchants? Full rollout? Internal testing only?
2. What's the success metric? Transaction volume, revenue from crypto fees, or merchant adoption rate?
3. What's the budget? Is there budget allocated for a third-party gateway license?`,
    whatSeniorsDoDifferently:
      'Senior BAs don\'t just ask questions — they come to the discovery meeting with a draft answer for each question based on their own research. "I looked at RBI\'s latest crypto guidelines and I think these 3 regulations apply. Can you confirm?" That\'s 10x more productive than open-ended questions.',
    quizQuestion: {
      question:
        'The CEO says "add crypto payments by Q2." Three stakeholders interpret it differently. You have a meeting at 4pm. What\'s the BA\'s first action?',
      options: [
        'Start writing a PRD based on the most likely interpretation',
        'Draft discovery questions grouped by stakeholder to structure the 4pm meeting',
        'Ask engineering for a timeline estimate so you have something concrete',
        'Schedule separate 1:1s with each stakeholder before the meeting',
      ],
      correctIndex: 1,
      conceptTitle: 'Structure the Ambiguity First',
      explanation:
        'When requirements are undefined and stakeholders disagree, the BA\'s job is to structure the ambiguity — not resolve it prematurely.\n\nWriting a PRD without discovery bakes in assumptions. Asking for timelines before requirements are clear gives you a precise answer to the wrong question. Separate 1:1s take too long when you have a 4pm deadline.\n\nGrouped discovery questions turn a chaotic meeting into a structured conversation where each stakeholder addresses their domain.',
      realWorldContext:
        'In fast-moving Indian startups, BAs rarely get a proper brief. The ability to take a vague directive and turn it into structured questions in 2 hours is what separates effective BAs from note-takers.',
    },
    signupHook: {
      headline: 'You just created a real BA deliverable.',
      valueProps: [
        '7-day BA curriculum tailored to your experience level',
        'Practice requirements discovery, stakeholder interviews, and PRD writing',
        'Learn frameworks used at top Indian product companies',
      ],
      ctaText: 'Get Your BA Curriculum — Free',
    },
  },
};

// ---------------------------------------------------------------------------
// 3. TECHNICAL PROGRAM MANAGER — CloudGrid Systems
// ---------------------------------------------------------------------------

const tpmSimulation: RoleSimulation = {
  id: 'tpm',
  role: 'Technical Program Manager',
  company: {
    name: 'CloudGrid Systems',
    type: '400-person cloud infrastructure company',
    industry: 'Enterprise cloud services (2,000 clients)',
    yourRole: 'You are the Junior TPM on the Platform Reliability team',
  },
  icon: 'GitBranch',
  colorClass: 'emerald',
  estimatedMinutes: 5,
  skillTags: ['Dependency Mapping', 'Cross-Team Coordination', 'Risk Communication'],
  brief: {
    managerName: 'Meera Iyer',
    managerRole: 'Director of Engineering Programs',
    channel: 'slack',
    message: `Just got off a call. We have a situation. Three teams are building the new real-time alerting system for enterprise clients:

• Backend team (Vikram): Alert processing API — estimated 4 weeks
• Mobile team (Sneha): Push notification integration — needs Backend's API in 2 weeks or they miss the App Store submission deadline
• Platform team (Karthik): Message queue migration — this is a dependency for Backend. Just told me it's delayed 3 weeks.

Nobody has told anyone else about the delays yet. I need you to draft a program status update for the 3 team leads. Map out what's actually blocked, what can proceed, and propose a revised timeline. Send it before tomorrow's 10am program review.`,
    deadline: 'before tomorrow\'s 10am program review',
    deliverable: 'A program status update with dependency map and revised timeline',
  },
  task: {
    title: 'Write the Program Status Update',
    instructions:
      'Fill in the template below. Map the dependency chain, assess the real impact of the delay, and propose a revised plan. Think about what can proceed in parallel.',
    template: `PROGRAM STATUS UPDATE — Real-Time Alerting System
Date: Today
Status: 🔴 AT RISK — dependency delay identified

DEPENDENCY CHAIN:
Platform (message queue) → Backend (alert API) → Mobile (push notifications)

CURRENT STATE:
┌─────────────┬──────────────┬───────────────┬──────────┐
│ Team        │ Status       │ Blocker       │ ETA      │
├─────────────┼──────────────┼───────────────┼──────────┤
│ Platform    │ [status]     │ [blocker]     │ [date]   │
│ Backend     │ [status]     │ [blocker]     │ [date]   │
│ Mobile      │ [status]     │ [blocker]     │ [date]   │
└─────────────┴──────────────┴───────────────┴──────────┘

IMPACT:
If we do nothing: [what happens — which deadline slips by how much]

PROPOSED REVISED PLAN:
Week 1-2: [what each team does]
Week 3-4: [what each team does]
Week 5-6: [what each team does]

RISKS & MITIGATIONS:
1. [risk]: [mitigation]
2. [risk]: [mitigation]

DECISION NEEDED FROM LEADS:
[what you need them to agree on at the 10am review]`,
    templatePlaceholders: [
      'Platform status',
      'Platform blocker',
      'Platform ETA',
      'Backend status',
      'Backend blocker',
      'Backend ETA',
      'Mobile status',
      'Mobile blocker',
      'Mobile ETA',
      'Impact if we do nothing',
      'Week 1-2 plan',
      'Week 3-4 plan',
      'Week 5-6 plan',
      'Risk 1 and mitigation',
      'Risk 2 and mitigation',
      'Decision needed',
    ],
    hints: [
      {
        level: 1,
        hint: 'Draw the dependency chain first. Platform blocks Backend, Backend blocks Mobile. But does Mobile HAVE to wait? Can they build against a mock API?',
        encouragement: 'TPMs think in dependency graphs. You\'re building the right mental model.',
      },
      {
        level: 2,
        hint: `Here's the full walkthrough:

Platform's 3-week delay means Backend can't start queue-dependent work until week 3. But Backend CAN start non-queue parts (auth, rate limiting, API schema) immediately.

Mobile can build against a mock/stub API and integrate the real one later — this means they DON'T miss the App Store deadline.

Revised timeline: 6 weeks instead of 4, but Mobile meets their deadline with a mock integration, then swaps in the real API when Backend is ready.

Key risks: Mock API diverges from real API (mitigation: Backend provides the API contract/schema upfront). Platform delay extends further (mitigation: weekly checkpoint with Karthik).`,
        encouragement: 'This is exactly how senior TPMs think — unblock what you can, contain what you can\'t.',
      },
    ],
    estimatedMinutes: 4,
  },
  debrief: {
    exampleDeliverable: `PROGRAM STATUS UPDATE — Real-Time Alerting System
Date: Today
Status: 🔴 AT RISK — dependency delay identified

DEPENDENCY CHAIN:
Platform (message queue) → Backend (alert API) → Mobile (push notifications)

CURRENT STATE:
┌─────────────┬──────────────┬────────────────────────────────┬──────────┐
│ Team        │ Status       │ Blocker                        │ ETA      │
├─────────────┼──────────────┼────────────────────────────────┼──────────┤
│ Platform    │ 🔴 Delayed   │ Migration complexity — 3wk delay│ Week 5   │
│ Backend     │ 🟡 Partial   │ Waiting on Platform queue       │ Week 7   │
│ Mobile      │ 🟡 At risk   │ Needs Backend API by week 2     │ Week 4*  │
└─────────────┴──────────────┴────────────────────────────────┴──────────┘

IMPACT:
If we do nothing: Mobile misses App Store deadline (hard date). Backend delayed 3 weeks. Full system delivery slips from week 4 to week 7+.

PROPOSED REVISED PLAN:
Week 1-2: Backend builds non-queue components (auth, rate limiting, API schema). Mobile builds against mock API using Backend's schema contract. Platform continues queue migration.
Week 3-4: Platform completes migration. Backend integrates with real queue. Mobile submits to App Store with mock integration.
Week 5-6: Backend completes full API. Mobile swaps mock for real API in next app update.

RISKS & MITIGATIONS:
1. Mock API diverges from real API: Backend delivers API contract/schema to Mobile by end of week 1
2. Platform delay extends further: Weekly 30-min checkpoint with Karthik every Monday

DECISION NEEDED FROM LEADS:
Approve mock API approach for Mobile (lets them meet App Store deadline). Confirm Backend can start non-queue work independently.`,
    whatSeniorsDoDifferently:
      'Senior TPMs never bring a problem without a proposed solution. They also pre-wire the conversation — before the 10am review, they\'d Slack each lead individually: "There\'s a dependency issue. Here\'s my proposed plan. Any concerns before we discuss as a group?" The meeting becomes about refining the plan, not reacting to bad news.',
    quizQuestion: {
      question:
        'Three dependent teams are building a system. Team C discovers a 3-week delay. Teams A and B don\'t know yet. As TPM, what\'s your first action?',
      options: [
        'Tell Team C to find ways to accelerate and recover the lost time',
        'Map the full dependency chain, assess actual impact on each team, then communicate the situation AND a proposed path forward to all three leads simultaneously',
        'Only inform directly affected teams to avoid unnecessary alarm',
        'Escalate to the Director immediately and let leadership decide the path forward',
      ],
      correctIndex: 1,
      conceptTitle: 'Problems + Solutions, Not Just Problems',
      explanation:
        'The TPM\'s value is in the complete picture: what\'s blocked, what\'s not, and what to do about it.\n\nTelling Team C to "work faster" doesn\'t address the downstream impact. Informing only some teams creates information asymmetry. Escalating without a plan makes you a messenger, not a program manager.\n\nMapping dependencies, assessing impact, and proposing a path forward — then communicating it to all stakeholders simultaneously — is the TPM move.',
      realWorldContext:
        'At companies like Google and Microsoft, TPMs are evaluated on "program health visibility." The ability to quickly assess cross-team impact and propose solutions is the core TPM competency.',
    },
    signupHook: {
      headline: 'You just created a real TPM deliverable.',
      valueProps: [
        '7-day TPM curriculum tailored to your technical background',
        'Practice dependency mapping, cross-team coordination, and program reviews',
        'Build skills used at top tech companies for program management',
      ],
      ctaText: 'Get Your TPM Curriculum — Free',
    },
  },
};

// ---------------------------------------------------------------------------
// 4. PRODUCT ANALYST — ShopFlow
// ---------------------------------------------------------------------------

const productAnalystSimulation: RoleSimulation = {
  id: 'product-analyst',
  role: 'Product Analyst',
  company: {
    name: 'ShopFlow',
    type: '300-person e-commerce platform',
    industry: 'E-commerce (50,000 merchants across India)',
    yourRole: 'You are the Junior Product Analyst on the Growth team',
  },
  icon: 'BarChart3',
  colorClass: 'amber',
  estimatedMinutes: 5,
  skillTags: ['A/B Test Analysis', 'Revenue Impact', 'Data-Driven Recommendations'],
  brief: {
    managerName: 'Deepa Nair',
    managerRole: 'Head of Product Analytics',
    channel: 'slack',
    message: `A/B test results just came in for the new checkout redesign. Here are the numbers:

| Metric | Control (Old) | Variant (New) | Change |
|--------|--------------|---------------|--------|
| Checkout completion rate | 62% | 64% | +3.2% |
| Average order value | ₹2,450 | ₹2,254 | -8.0% |
| Cart abandonment rate | 38% | 36% | -5.3% |
| Time to complete checkout | 4.2 min | 3.1 min | -26.2% |

The PM is saying "completion rate is up, let's ship it." Revenue team is saying "AOV dropped, kill it." I need you to write a test analysis memo with your recommendation before the 3pm product review. Show your math. Don't just pick a side — show the actual revenue impact.`,
    deadline: 'before the 3pm product review',
    deliverable: 'An A/B test analysis memo with revenue impact calculation',
  },
  task: {
    title: 'Write the A/B Test Analysis Memo',
    instructions:
      'Fill in the template below. Calculate the actual revenue impact per 1,000 visitors (completion rate × AOV), make a recommendation, and identify what to investigate next.',
    template: `A/B TEST ANALYSIS — Checkout Redesign
Test duration: 2 weeks | Sample: 45,000 sessions per variant

KEY METRICS SUMMARY:
✅ Completion rate: 62% → 64% (+3.2%)
🔴 Average order value: ₹2,450 → ₹2,254 (-8.0%)
✅ Cart abandonment: 38% → 36% (-5.3%)
✅ Checkout speed: 4.2 min → 3.1 min (-26.2%)

REVENUE IMPACT CALCULATION:
Control: [completions per 1000] × [AOV] = [revenue per 1000 visitors]
Variant: [completions per 1000] × [AOV] = [revenue per 1000 visitors]
Net impact: [+/- amount] per 1000 visitors ([+/- %])

MY RECOMMENDATION:
[Ship / Don't ship / Ship with changes]

REASONING (3 sentences max):
[Why, based on the numbers]

WHAT I'D INVESTIGATE NEXT:
1. [fill in]
2. [fill in]`,
    templatePlaceholders: [
      'Control revenue calculation',
      'Variant revenue calculation',
      'Net impact',
      'Recommendation',
      'Reasoning',
      'Investigation 1',
      'Investigation 2',
    ],
    hints: [
      {
        level: 1,
        hint: 'Don\'t look at metrics in isolation. Revenue = completion rate × AOV. Calculate the net effect per 1,000 visitors for both control and variant.',
        encouragement: 'Analysts who show composite metrics earn trust. You\'re on the right track.',
      },
      {
        level: 2,
        hint: `Full calculation:

Control: 620 completions × ₹2,450 = ₹15,19,000 per 1,000 visitors
Variant: 640 completions × ₹2,254 = ₹14,42,560 per 1,000 visitors
Net: -₹76,440 per 1,000 visitors (-5.0%)

The new design LOSES money despite higher completion rate.

Recommendation: Don't ship as-is. Investigate why AOV dropped — likely fewer upsell prompts in the faster checkout flow. Propose a third variant that keeps the speed improvement but restores upsell placement.`,
        encouragement: 'This is exactly the kind of analysis that changes a product decision. Numbers beat opinions.',
      },
    ],
    estimatedMinutes: 4,
  },
  debrief: {
    exampleDeliverable: `A/B TEST ANALYSIS — Checkout Redesign
Test duration: 2 weeks | Sample: 45,000 sessions per variant

KEY METRICS SUMMARY:
✅ Completion rate: 62% → 64% (+3.2%)
🔴 Average order value: ₹2,450 → ₹2,254 (-8.0%)
✅ Cart abandonment: 38% → 36% (-5.3%)
✅ Checkout speed: 4.2 min → 3.1 min (-26.2%)

REVENUE IMPACT CALCULATION:
Control: 620 completions × ₹2,450 = ₹15,19,000 per 1,000 visitors
Variant: 640 completions × ₹2,254 = ₹14,42,560 per 1,000 visitors
Net impact: -₹76,440 per 1,000 visitors (-5.0%)

MY RECOMMENDATION:
Don't ship as-is. Investigate and iterate.

REASONING:
Despite higher completion rate (+3.2%), the AOV drop (-8.0%) results in a net revenue loss of 5% per visitor. The faster checkout likely removed upsell/cross-sell touchpoints. We should test a third variant that keeps the speed gains while restoring strategic upsell placement.

WHAT I'D INVESTIGATE NEXT:
1. Segment analysis — does the AOV drop affect all merchant categories or just small-basket merchants? If large merchants are unaffected, we could ship to that segment.
2. Funnel analysis — where exactly do users spend less? Fewer items per cart, or same items at lower individual value? This tells us if it's an upsell problem or a different behavior change.`,
    whatSeniorsDoDifferently:
      'Senior analysts never present a single metric. They always show the composite — revenue per visitor, LTV impact, or whatever the business actually optimizes for. They also pre-segment the data: "The AOV drop is concentrated in merchants with <₹1,000 average baskets. For merchants with >₹5,000 baskets, the new design actually increases both completion AND AOV." That\'s the insight that changes the decision.',
    quizQuestion: {
      question:
        'An A/B test shows checkout completion rate +3% but AOV -8%. The PM wants to ship. What should the analyst recommend?',
      options: [
        'Ship it — more completions means more customers, and AOV will recover over time',
        'Kill it — any drop in AOV is a red flag that should block the launch',
        'Calculate the composite revenue impact (completion × AOV), show it\'s net negative, and recommend investigating the AOV drop before shipping',
        'Run the test for another 2 weeks — the data might not be statistically significant',
      ],
      correctIndex: 2,
      conceptTitle: 'Composite Metrics Beat Individual Metrics',
      explanation:
        'Individual metrics lie. Completion rate up (+3%) sounds great. AOV down (-8%) sounds bad. Neither tells the full story.\n\nRevenue per visitor = completion rate × AOV. When you calculate it: the new design loses 5% revenue per visitor despite more people completing checkout.\n\nThe analyst\'s job is to show the composite metric, explain why it matters, and propose next steps — not just report numbers.',
      realWorldContext:
        'At Flipkart and Meesho, product analysts are expected to present "revenue impact per user" for every A/B test, not just individual conversion metrics. This is the standard bar for data-driven product decisions.',
    },
    signupHook: {
      headline: 'You just created a real analyst deliverable.',
      valueProps: [
        '7-day Product Analyst curriculum tailored to your background',
        'Practice A/B test analysis, metrics definition, and stakeholder presentations',
        'Learn the analytical frameworks used at top Indian product companies',
      ],
      ctaText: 'Get Your Analyst Curriculum — Free',
    },
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ROLE_SIMULATIONS: RoleSimulation[] = [
  pmSimulation,
  baSimulation,
  tpmSimulation,
  productAnalystSimulation,
];

export const ROLE_SIMULATIONS_MAP: Record<RoleId, RoleSimulation> = {
  pm: pmSimulation,
  ba: baSimulation,
  tpm: tpmSimulation,
  'product-analyst': productAnalystSimulation,
};
