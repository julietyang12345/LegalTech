import { DemoQuizQuestion } from './demoContent';

export const CAREER_DEMO_TOPIC = {
  skill: 'Dual Career Paths: Data Engineering & GenAI',
  day: 'Day 1',
  title: 'From Generalist to Specialist—Choosing Your GenAI Focus',
};

export const CAREER_DEMO_PREPROMPT = {
  objectives: [
    'Compare the career trajectories of Data Engineering vs GenAI specialization',
    'Identify the 3 skill milestones that separate junior from senior GenAI practitioners',
    'Map your existing skills to the highest-leverage GenAI sub-specialization for your background',
  ],
  primeQuestions: [
    'What does your current skill set have in common with what GenAI teams actually hire for?',
    'Why are some engineers able to transition into GenAI roles in 6 months while others plateau?',
    'How would you explain the difference between "using AI tools" and "building AI systems" to a non-technical friend?',
  ],
};

export const CAREER_DEMO_QUIZ: DemoQuizQuestion[] = [
  {
    question:
      'A company is hiring for a "GenAI Engineer" role. Which skill set best matches what most employers actually mean?',
    options: [
      'Deep expertise in training large language models from scratch',
      'Prompt engineering, RAG pipelines, fine-tuning, and integrating LLM APIs into production apps',
      'Traditional machine learning with scikit-learn and XGBoost',
      'Frontend development with ChatGPT plugin experience',
    ],
    correctIndex: 1,
    conceptTitle: 'What GenAI Engineering Actually Means',
    explanation:
      'Most "GenAI Engineer" roles focus on applied AI — building production systems that leverage existing models, not training new ones from scratch. The core skills are: designing RAG (Retrieval-Augmented Generation) pipelines, fine-tuning open-source models, prompt engineering at scale, and integrating LLM APIs reliably.\n\nTraining LLMs from scratch is typically reserved for research labs at companies like OpenAI or Anthropic. The applied GenAI space is where 90% of job openings exist, and it rewards engineers who can ship reliable AI-powered features.',
    realWorldContext:
      'LinkedIn data shows "GenAI Engineer" postings grew 5x in 2024, with the majority requiring RAG and API integration experience over pure ML research.',
  },
  {
    question:
      'What is the most important difference between a Data Engineering career path and a GenAI career path?',
    options: [
      'Data Engineers earn more money',
      'GenAI roles require a PhD while Data Engineering does not',
      'Data Engineering focuses on reliable data movement and quality; GenAI focuses on building intelligent features on top of that data',
      'They are essentially the same role with different titles',
    ],
    correctIndex: 2,
    conceptTitle: 'Two Paths, One Data Foundation',
    explanation:
      'Data Engineering is about building the infrastructure — pipelines, warehouses, quality checks — that makes data reliable and accessible. GenAI Engineering builds on top of that foundation to create intelligent features: search, recommendations, content generation, and agents.\n\nNeither role requires a PhD (that is a common myth for GenAI). The key distinction is your daily focus: Data Engineers ask "Is the right data flowing to the right place?" while GenAI Engineers ask "How do I make this model produce useful, reliable outputs?"',
    realWorldContext:
      'Many successful GenAI engineers started in Data Engineering. Understanding how data flows gives you a massive advantage when building RAG systems and fine-tuning pipelines.',
  },
  {
    question:
      'You are a backend developer with 2 years of experience. Which first step gives you the fastest path to a GenAI role?',
    options: [
      'Enroll in a 4-year machine learning degree program',
      'Build a RAG application using an open-source framework (like LangChain or LlamaIndex) with a real dataset',
      'Memorize the Transformer architecture paper',
      'Learn Python from scratch before touching any AI tools',
    ],
    correctIndex: 1,
    conceptTitle: 'The Portfolio-First Approach',
    explanation:
      'For backend developers transitioning to GenAI, the highest-leverage move is building a working RAG application. It demonstrates that you can: ingest real data, chunk and embed it, set up vector search, and orchestrate LLM calls — the exact workflow most GenAI teams need.\n\nYou already know APIs, databases, and deployment from your backend experience. A RAG project lets you apply those skills immediately while learning the GenAI-specific layer. Theory (like the Transformer paper) is useful background but does not get you hired alone.',
    realWorldContext:
      'Hiring managers consistently rank "shipped a working AI project" above "completed an AI course" when evaluating GenAI candidates.',
  },
  {
    question:
      'What separates a junior GenAI practitioner from a senior one?',
    options: [
      'Seniors know more Python libraries',
      'Seniors can design evaluation frameworks, handle edge cases in production, and make cost-performance tradeoffs across model providers',
      'Seniors only use the most expensive models for better quality',
      'Seniors focus exclusively on prompt engineering without worrying about infrastructure',
    ],
    correctIndex: 1,
    conceptTitle: 'The Three Seniority Milestones',
    explanation:
      'The three milestones that define seniority in GenAI:\n\n1. **Evaluation**: Juniors eyeball outputs. Seniors build systematic evaluation frameworks with metrics, test suites, and regression checks.\n\n2. **Production hardening**: Seniors handle rate limits, fallback models, content filtering, latency budgets, and graceful degradation — the unsexy work that makes AI features reliable.\n\n3. **Cost-performance tradeoffs**: Knowing when to use GPT-4 vs a fine-tuned smaller model vs a cached response. This saves companies thousands monthly and is a high-signal skill.',
    realWorldContext:
      'A common interview question for senior GenAI roles: "Your RAG pipeline returns incorrect answers 15% of the time. Walk me through how you would diagnose and fix this."',
  },
  {
    question:
      'You are designing your 6-month learning plan. Which combination of activities best prepares you for a GenAI role?',
    options: [
      'Watch 200 hours of YouTube tutorials on AI fundamentals',
      'Build 3 progressively complex projects (chatbot → RAG app → agent) while contributing to one open-source AI tool',
      'Read every research paper published on arXiv about large language models',
      'Get certified in as many cloud platforms as possible',
    ],
    correctIndex: 1,
    conceptTitle: 'The Optimal Learning Stack',
    explanation:
      'The most effective 6-month plan combines building with visibility:\n\n**Build progressively**: Start with a simple chatbot (API basics), then build a RAG app (data + retrieval), then build an agent (reasoning + tool use). Each project layers new skills on top of the last.\n\n**Contribute to open source**: Even small contributions (docs, bug fixes, examples) to tools like LangChain, LlamaIndex, or vLLM signal that you understand real-world codebases and can collaborate with a team.\n\nTutorials alone do not build muscle memory, and papers alone do not build intuition. Projects + community involvement create both.',
    realWorldContext:
      'Engineers who publicly share their project write-ups (blog posts, GitHub READMEs) are 3x more likely to receive inbound recruiter interest for GenAI roles.',
  },
];

export const CAREER_DEMO_DAY2 = {
  title: 'Building Portfolio Projects That Get Offers—Beyond Hello World',
  teaser:
    'Learn the exact project structure, README template, and demo strategy that makes hiring managers respond to your applications within 48 hours.',
};
