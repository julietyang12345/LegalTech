export interface DemoCard {
  title: string;
  emoji: string;
  content: string;
  microQuestion: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export interface DemoQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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

export const DEMO_CARDS: DemoCard[] = [
  {
    title: 'The Instruction Frame',
    emoji: '🎯',
    content:
      'Every effective prompt starts with a clear instruction. Instead of "tell me about dogs", write "Explain 3 key differences between golden retrievers and labrador retrievers in terms of temperament." The more specific your instruction, the more useful the response. Think of it like ordering food — "give me something good" vs "I\'d like a medium-rare ribeye with roasted vegetables."',
    microQuestion: {
      question: 'Which prompt would produce a more useful response?',
      options: [
        '"Write about marketing"',
        '"List 5 low-budget marketing tactics for a new coffee shop targeting college students"',
        '"Tell me everything you know about marketing strategies"',
        '"Marketing help please"',
      ],
      correctIndex: 1,
      explanation:
        'Specific prompts with a clear scope (5 tactics), context (coffee shop), and audience (college students) produce focused, actionable responses.',
    },
  },
  {
    title: 'Context is King',
    emoji: '👑',
    content:
      'Context tells the AI who you are, what you know, and what you need. Adding "I\'m a beginner" vs "I\'m a senior developer" changes the entire response. You can also set a role: "Act as a nutritionist" or "You are a patient Python tutor." Context doesn\'t need to be long — even one sentence of background dramatically improves results.',
    microQuestion: {
      question: 'What is the primary purpose of adding context to a prompt?',
      options: [
        'To make the prompt longer',
        'To help the AI calibrate its response to your situation',
        'To confuse the AI into trying harder',
        'To bypass the AI\'s safety filters',
      ],
      correctIndex: 1,
      explanation:
        'Context helps the AI understand your knowledge level, goals, and constraints so it can tailor the response appropriately.',
    },
  },
  {
    title: 'Output Formatting',
    emoji: '📋',
    content:
      'Telling the AI how to format its response saves you time. You can request: bullet points, numbered lists, tables, JSON, code blocks, or a specific word count. For example: "Give me a comparison table with columns for Feature, Pros, and Cons." You can even provide an example of the format you want and say "follow this structure."',
    microQuestion: {
      question: 'When should you specify the output format?',
      options: [
        'Only when writing code',
        'Never — the AI knows best',
        'Whenever you have a preference for how the answer should look',
        'Only for creative writing tasks',
      ],
      correctIndex: 2,
      explanation:
        'Specifying format whenever you have a preference — whether it\'s a table, bullet list, or JSON — ensures you get a response you can immediately use.',
    },
  },
];

export const DEMO_QUIZ: DemoQuizQuestion[] = [
  {
    question: 'What are the three building blocks of an effective prompt?',
    options: [
      'Length, complexity, and politeness',
      'Instruction, context, and output format',
      'Role, temperature, and token count',
      'Question, follow-up, and feedback',
    ],
    correctIndex: 1,
    explanation:
      'A clear instruction, relevant context, and a specified output format are the three building blocks covered in this lesson.',
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
    explanation:
      'This prompt combines a clear instruction (create a 7-day meal plan), context (vegetarian athlete, marathon training), and output format (table with specific columns).',
  },
  {
    question: 'Why does adding "I\'m a beginner" to your prompt matter?',
    options: [
      'It makes the AI respond faster',
      'It unlocks hidden features',
      'It helps the AI calibrate the complexity of its explanation',
      'It has no real effect',
    ],
    correctIndex: 2,
    explanation:
      'Stating your experience level is context that helps the AI adjust vocabulary, depth, and assumptions to match your understanding.',
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
    explanation:
      'Adding an output format (3 bullet points) and context (knows HTML/CSS) constrains the response to exactly what you need.',
  },
];
