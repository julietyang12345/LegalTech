export interface DemoQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  conceptTitle?: string;
  realWorldContext?: string;
}

export const DEMO_TOPIC = {
  skill: 'AI Prompt Engineering',
  day: 'Day 1',
  title: 'The Art of Clear Instructions',
};

export const DEMO_PREPROMPT = {
  objectives: [
    'Understand why prompt structure matters more than prompt length',
    'Learn the 3 building blocks of an effective prompt',
    'Write prompts that get consistent, useful results on the first try',
  ],
  primeQuestions: [
    'What makes the difference between a vague prompt and a precise one?',
    'How does giving context change the output you get from an AI?',
    'Why does specifying the output format save you time?',
  ],
};

export const DEMO_QUIZ: DemoQuizQuestion[] = [
  {
    question: 'Which prompt would produce a more useful response?',
    options: [
      '"Write about marketing"',
      '"List 5 low-budget marketing tactics for a new coffee shop targeting college students"',
      '"Tell me everything you know about marketing strategies"',
      '"Marketing help please"',
    ],
    correctIndex: 1,
    conceptTitle: 'The Instruction Frame',
    explanation:
      'Every effective prompt starts with a clear instruction. Instead of "tell me about dogs", write "Explain 3 key differences between golden retrievers and labrador retrievers in terms of temperament." The more specific your instruction, the more useful the response.\n\nThink of it like ordering food — "give me something good" vs "I\'d like a medium-rare ribeye with roasted vegetables." Specific prompts with a clear scope (5 tactics), context (coffee shop), and audience (college students) produce focused, actionable responses.',
    realWorldContext:
      'In practice, spending 30 extra seconds crafting a specific prompt saves you minutes of follow-up questions and re-prompting.',
  },
  {
    question: 'What is the primary purpose of adding context to a prompt?',
    options: [
      'To make the prompt longer',
      'To help the AI calibrate its response to your situation',
      'To confuse the AI into trying harder',
      'To bypass the AI\'s safety filters',
    ],
    correctIndex: 1,
    conceptTitle: 'Context is King',
    explanation:
      'Context tells the AI who you are, what you know, and what you need. Adding "I\'m a beginner" vs "I\'m a senior developer" changes the entire response. You can also set a role: "Act as a nutritionist" or "You are a patient Python tutor."\n\nContext doesn\'t need to be long — even one sentence of background dramatically improves results. It helps the AI understand your knowledge level, goals, and constraints so it can tailor the response appropriately.',
    realWorldContext:
      'Professional prompt engineers always include at least one line of context — it\'s the single highest-ROI improvement you can make to any prompt.',
  },
  {
    question: 'When should you specify the output format in your prompt?',
    options: [
      'Only when writing code',
      'Never — the AI knows best',
      'Whenever you have a preference for how the answer should look',
      'Only for creative writing tasks',
    ],
    correctIndex: 2,
    conceptTitle: 'Output Formatting',
    explanation:
      'Telling the AI how to format its response saves you time. You can request: bullet points, numbered lists, tables, JSON, code blocks, or a specific word count. For example: "Give me a comparison table with columns for Feature, Pros, and Cons."\n\nYou can even provide an example of the format you want and say "follow this structure." Specifying format whenever you have a preference ensures you get a response you can immediately use without reformatting.',
    realWorldContext:
      'Teams that standardize on output formats (like JSON for data or markdown tables for comparisons) can automate their AI workflows much more easily.',
  },
  {
    question:
      'You need a meal plan. Which prompt best applies today\'s lesson?',
    options: [
      '"Make me a meal plan"',
      '"I\'m a vegetarian athlete training for a marathon. Create a 7-day meal plan in a table with columns for Meal, Calories, and Protein."',
      '"What should I eat?"',
      '"Give me the best meal plan ever"',
    ],
    correctIndex: 1,
    conceptTitle: 'Putting It All Together',
    explanation:
      'This prompt combines all three building blocks: a clear instruction (create a 7-day meal plan), context (vegetarian athlete, marathon training), and output format (table with specific columns).\n\nNotice how each element works together — the instruction defines what you want, the context helps the AI personalize it, and the format ensures the output is immediately useful. When all three align, you rarely need follow-up prompts.',
    realWorldContext:
      'The best prompts feel like filling out a brief: what do you need, who is it for, and how should it look?',
  },
  {
    question:
      'You asked "Explain React" and got an overwhelming response. What\'s the best fix?',
    options: [
      'Ask again and hope for a shorter answer',
      'Add "in 3 bullet points, for someone who knows HTML/CSS but not JavaScript frameworks"',
      'Switch to a different AI tool',
      'Just read the first paragraph and ignore the rest',
    ],
    correctIndex: 1,
    conceptTitle: 'Iterating on Prompts',
    explanation:
      'Adding an output format (3 bullet points) and context (knows HTML/CSS) constrains the response to exactly what you need. This is the iterative approach — when a prompt doesn\'t work, diagnose which building block is missing and add it.\n\nIn this case, the original prompt lacked both format constraints and context about your experience level. The fix addresses both, turning a wall of text into a concise, targeted explanation.',
    realWorldContext:
      'Even expert prompt engineers iterate. The key is knowing which building block to adjust rather than starting from scratch.',
  },
];
