import { DemoQuizQuestion } from './demoContent';

export const CAREER_DEMO_TOPIC = {
  skill: 'Dual Career Paths: Data Engineering & GenAI',
  day: 'Day 1',
  title: 'From Generalist to Specialist—Choosing Your GenAI Focus',
};

export const CAREER_DEMO_PREPROMPT = {
  objectives: [
    'Evaluate whether a DE→GenAI transition makes strategic sense given your background — or whether a hybrid path is stronger',
    'Understand the structural forces shaping long-term demand for Data Engineering vs GenAI roles through 2030',
    'Build a realistic 6-month transition roadmap that accounts for the "too many options" paralysis trap',
  ],
  primeQuestions: [
    'If Data Engineering pipelines increasingly get automated by AI, does that make DE skills less valuable — or more valuable as the foundation GenAI runs on?',
    'What is the actual risk of committing to GenAI now versus waiting 12 months to see how the market shakes out?',
    'When you look at the people who successfully transitioned into GenAI, what did they stop doing that most learners refuse to drop?',
  ],
};

export const CAREER_DEMO_QUIZ: DemoQuizQuestion[] = [
  {
    question:
      'A Data Engineer with 3 years of experience is considering transitioning to GenAI. Their manager says "GenAI is a hype bubble — stick with data pipelines." What is the most accurate assessment of this advice?',
    options: [
      'The manager is correct — GenAI hiring will collapse within 2 years and DE is the safer bet',
      'The manager is wrong — DE is being fully automated and will be obsolete within 5 years',
      'The advice ignores that DE skills (pipeline orchestration, data quality, infra) are directly transferable to GenAI systems — the transition risk is lower than it appears',
      'The engineer should ignore career advice entirely and follow their passion regardless of market signals',
    ],
    correctIndex: 2,
    conceptTitle: 'The DE→GenAI Transition Risk Is Overestimated',
    explanation:
      'Data Engineering skills are not wasted in a GenAI transition — they are a competitive advantage. Production GenAI systems are fundamentally data systems: RAG pipelines need reliable data ingestion, vector stores need the same orchestration patterns as data warehouses, and fine-tuning requires the same data quality rigor as analytics.\n\nThe real risk calculus: a DE who adds GenAI skills becomes a rare "full-stack AI engineer" who can build end-to-end. A DE who ignores GenAI entirely may find their pipeline-only work increasingly commoditized by tools like dbt, Fivetran, and AI-assisted ETL. The strongest move is not "switch" but "expand."',
    realWorldContext:
      'Companies like Airbnb, Stripe, and Databricks are actively hiring for roles that blend DE and GenAI — titles like "ML Platform Engineer" and "AI Infrastructure Engineer" that command 20-40% premiums over pure DE roles.',
  },
  {
    question:
      'Looking at 2025-2030 market projections, which statement most accurately describes the long-term outlook for Data Engineering vs GenAI roles?',
    options: [
      'GenAI will completely replace Data Engineering — all DE work will be automated by AI agents',
      'Both fields will grow, but GenAI roles will increasingly require DE fundamentals while pure "prompt-only" GenAI roles will commoditize',
      'Data Engineering will remain unchanged — the field is immune to AI disruption',
      'The market will consolidate into a single "AI Engineer" role that replaces both specializations',
    ],
    correctIndex: 1,
    conceptTitle: 'The Convergence Thesis',
    explanation:
      'The most likely scenario is convergence, not replacement. Here is what the data shows:\n\n**DE is not going away** — every GenAI system needs clean, reliable, well-orchestrated data. But the tools are getting more abstract (Spark → dbt → AI-assisted pipelines), which means the bar for "just moving data" keeps rising.\n\n**GenAI "prompt engineering" is commoditizing** — basic prompt skills are becoming table stakes, like knowing SQL. The GenAI roles that will sustain premium compensation require systems thinking: evaluation frameworks, retrieval optimization, model serving infrastructure, and cost management.\n\n**The premium is at the intersection** — engineers who understand both the data layer and the AI layer can architect end-to-end systems that neither pure DE nor pure GenAI specialists can build alone.',
    realWorldContext:
      'Databricks, Snowflake, and Google are all building "AI-native data platforms" — products that assume the data engineer also understands embeddings, vector search, and model serving. This is the clearest signal of where the market is heading.',
  },
  {
    question:
      'An engineer has spent 6 months "learning GenAI" — they have completed 4 online courses, watched 100+ YouTube videos, and can explain transformers, attention mechanisms, and RLHF in detail. But they have zero projects and have not applied to any roles. What is the most likely diagnosis?',
    options: [
      'They need one more course to feel ready — perhaps a specialization in agents or fine-tuning',
      'They are stuck in "analysis paralysis" — consuming information feels like progress but is actually a way to avoid the discomfort of building and shipping imperfect work',
      'Their approach is correct — you need at least 12 months of theory before building anything',
      'They should pivot to a different field since 6 months without results proves GenAI is not for them',
    ],
    correctIndex: 1,
    conceptTitle: 'The Consumption Trap vs. The Building Threshold',
    explanation:
      'This is the most common failure mode in career transitions: mistaking consumption for progress. The pattern is seductive — each new course or video delivers a dopamine hit of "I learned something" without the anxiety of "I built something that might not work."\n\nThe uncomfortable truth: you cross the "employable threshold" in GenAI not when you understand the theory, but when you have shipped something that works. A messy RAG app with real data and a live demo beats a perfect explanation of attention mechanisms in every interview.\n\n**The fix is a forcing function**: set a 2-week deadline to build and deploy one project. Accept that it will be imperfect. The gap between "I know about RAG" and "I have built a RAG system" is where all the real learning happens — the edge cases, the debugging, the "why is my retrieval returning garbage" moments that no course teaches.',
    realWorldContext:
      'Research on skill acquisition shows that deliberate practice (building under constraints) produces 3-5x faster skill development than passive study. The engineers who transition fastest are the ones who start building in week 2, not month 6.',
  },
  {
    question:
      'You have decided to commit to a GenAI career path. You have 4 hours per week outside work. Which 6-month roadmap has the highest probability of landing you an AI engineering role?',
    options: [
      'Months 1-6: Complete a full ML specialization on Coursera, then start looking for projects',
      'Months 1-2: Build a RAG app with your domain data. Months 3-4: Add evaluation + fine-tuning. Months 5-6: Deploy an agent and write 2 technical blog posts. Apply throughout.',
      'Months 1-6: Contribute to LangChain open source full-time, ignoring personal projects',
      'Months 1-3: Study transformer architecture papers. Months 4-6: Implement a transformer from scratch in PyTorch',
    ],
    correctIndex: 1,
    conceptTitle: 'The Compound Project Roadmap',
    explanation:
      'The key insight is compound projects — each one builds on the last, so 4 hours/week produces visible, stackable proof of competence:\n\n**Phase 1 (RAG app)**: Proves you can ingest data, embed it, retrieve relevant chunks, and orchestrate LLM calls. This is the baseline skill every GenAI team needs. Use your domain expertise — a RAG app over legal docs, medical records, or financial reports is more impressive than a generic Wikipedia chatbot.\n\n**Phase 2 (Evaluation + Fine-tuning)**: Shows you understand quality — you can measure whether your system is actually good, not just "seems to work." Adding fine-tuning demonstrates you can customize models for specific use cases.\n\n**Phase 3 (Agent + Writing)**: Agents are the current frontier — building one shows you are at the cutting edge. Blog posts create discoverable proof that recruiters and hiring managers find organically.\n\n**Applying throughout** is critical — you do not wait until you feel "ready." Your first applications will fail, and that feedback is itself a learning signal.',
    realWorldContext:
      'A portfolio of 3 deployed projects with blog write-ups consistently outperforms a resume listing 10 completed courses. Hiring managers spend an average of 6 seconds on a resume but 2-3 minutes exploring a live demo.',
  },
  {
    question:
      'Two engineers start learning GenAI at the same time. Engineer A picks one framework (LangChain), one model provider (OpenAI), and one project type (RAG), and goes deep for 3 months. Engineer B spends the same 3 months trying LangChain, LlamaIndex, Haystack, CrewAI, AutoGen, and Semantic Kernel — building hello-world examples in each. Who is more employable at month 3, and why?',
    options: [
      'Engineer B — they have broader exposure and can list more technologies on their resume',
      'They are equally employable — breadth and depth are interchangeable at the junior level',
      'Engineer A — depth in one stack produces production-ready skills and a deployable project, while breadth produces shallow familiarity that fails under interview pressure',
      'Neither — 3 months is insufficient to become employable in GenAI regardless of approach',
    ],
    correctIndex: 2,
    conceptTitle: 'Depth-First Beats Breadth-First for Career Transitions',
    explanation:
      'This question directly addresses the "too many options → no progress" trap. The paradox of choice in GenAI tooling is real — there are dozens of frameworks, model providers, and deployment options, and exploring all of them feels productive but produces no deployable depth.\n\nEngineer A after 3 months: has a working RAG app, has debugged real retrieval problems, understands LangChain\'s internals well enough to customize, and can speak confidently about tradeoffs they have actually encountered.\n\nEngineer B after 3 months: can describe 6 frameworks at a surface level, has no production-ready project, and in an interview will struggle with "walk me through a problem you solved" because every project was abandoned at the hello-world stage.\n\n**The framework does not matter.** What matters is going deep enough to encounter and solve real problems. You can always learn a second framework later — but only after you have the mental model that comes from mastering one.',
    realWorldContext:
      'Senior engineers who interview GenAI candidates report that the #1 red flag is "lists many tools, cannot go deep on any." The #1 green flag is "built something real, can explain every decision and tradeoff."',
  },
];

export const CAREER_DEMO_DAY2 = {
  title: 'Building Portfolio Projects That Get Offers—Beyond Hello World',
  teaser:
    'Learn the exact project structure, README template, and demo strategy that makes hiring managers respond to your applications within 48 hours.',
};
