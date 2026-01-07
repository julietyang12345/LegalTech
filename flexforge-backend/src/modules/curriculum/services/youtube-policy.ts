// ============================================
// YOUTUBE CHANNEL POLICY SYSTEM v2
// ============================================
//
// Key Features:
// 1. 3-tier policy: allow -> deprioritize -> block
// 2. Match by channelId (stable) + handle (exact)
// 3. Post-retrieval filtering (not search operators)
// 4. Separate marketing level from content quality
// 5. Hard flags vs soft warnings
// 6. Content signals (chapters, repos, project-based)
// ============================================

// ============================================
// TYPES
// ============================================

export type ChannelPolicy = 'allow' | 'deprioritize' | 'block';

export type ContentCompleteness = 'complete' | 'partial' | 'preview';

export type SignalConfidence = 'high' | 'medium' | 'low';

export interface YouTubeChannel {
  name: string;
  channelId: string;           // Required - stable identifier
  handle?: string;             // @username (optional, must be verified)
  aliases?: string[];          // Alternative names to match
  policy: ChannelPolicy;
  topics: string[];

  // Separate concerns
  contentQuality: 'excellent' | 'good' | 'acceptable';
  marketingLevel: 'none' | 'light' | 'moderate' | 'heavy';

  // Licensing for embedding
  license?: 'standard' | 'cc-by' | 'cc-by-nc-sa';
  canEmbedCommercially?: boolean;

  notes?: string;
}

// ============================================
// CHANNEL DATABASE
// ============================================

export const CHANNEL_DATABASE: YouTubeChannel[] = [
  // ═══════════════════════════════════════════
  // ALLOW: Education-First, High Quality
  // ═══════════════════════════════════════════

  // Nonprofits & Universities
  {
    name: 'freeCodeCamp',
    channelId: 'UC8butISFwT-Wl7EV0hUK0BQ',
    handle: '@freecodecamp',
    aliases: ['freecodecamp.org', 'fcc'],
    policy: 'allow',
    topics: ['web dev', 'python', 'javascript', 'all programming'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    license: 'cc-by',
    canEmbedCommercially: true,
    notes: 'Nonprofit, full courses, no ads in videos',
  },
  {
    name: 'Khan Academy',
    channelId: 'UC4a-Gbdw7vOaccHmFo40b9g',
    handle: '@khanacademy',
    policy: 'allow',
    topics: ['math', 'science', 'computing', 'economics'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    license: 'cc-by-nc-sa',
    canEmbedCommercially: false,
    notes: 'Nonprofit, structured curriculum',
  },
  {
    name: 'MIT OpenCourseWare',
    channelId: 'UCEBb1b_L6zDS3xTUrIALZOw',
    handle: '@mitocw',
    aliases: ['MIT OCW', 'MITOCW'],
    policy: 'allow',
    topics: ['CS', 'engineering', 'math', 'physics'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    license: 'cc-by-nc-sa',
    canEmbedCommercially: false,
    notes: 'University lectures, complete courses',
  },
  {
    name: 'Harvard CS50',
    channelId: 'UCcabW7890RKJzL968QWEykA',
    handle: '@cs50',
    policy: 'allow',
    topics: ['CS fundamentals', 'web', 'AI', 'python'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },

  // Passion Projects (Creators who teach for love of topic)
  {
    name: '3Blue1Brown',
    channelId: 'UCYO_jab_esuFRV4b17AJtAw',
    handle: '@3blue1brown',
    policy: 'allow',
    topics: ['math', 'linear algebra', 'calculus', 'neural networks'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
    notes: 'Best math visualizations anywhere',
  },
  {
    name: 'The Coding Train',
    channelId: 'UCvjgXvBlbQiAffgfxWvfaeQ',
    handle: '@TheCodingTrain',
    aliases: ['Coding Train', 'Dan Shiffman'],
    policy: 'allow',
    topics: ['creative coding', 'p5.js', 'javascript', 'algorithms'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    license: 'cc-by',
    canEmbedCommercially: true,
    notes: 'Open source advocate, very engaging',
  },
  {
    name: 'Computerphile',
    channelId: 'UC9-y-6csu5WGm29I7JiwpnA',
    handle: '@Computerphile',
    policy: 'allow',
    topics: ['CS concepts', 'security', 'algorithms', 'history'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'Numberphile',
    channelId: 'UCoxcjq-8xIDTYp3uz647V5A',
    handle: '@numberphile',
    policy: 'allow',
    topics: ['math'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'StatQuest with Josh Starmer',
    channelId: 'UCtYLUTtgS3k1Fg4y5tAhLbw',
    handle: '@statquest',
    aliases: ['StatQuest'],
    policy: 'allow',
    topics: ['statistics', 'machine learning', 'data science'],
    contentQuality: 'excellent',
    marketingLevel: 'light',
    canEmbedCommercially: true,
    notes: 'Clear explanations, jingles',
  },
  {
    name: 'Ben Eater',
    channelId: 'UCS0N5baNlQWJCUrhCEo8WlA',
    handle: '@BenEater',
    policy: 'allow',
    topics: ['computer architecture', 'electronics', 'networking'],
    contentQuality: 'excellent',
    marketingLevel: 'light',
    canEmbedCommercially: true,
    notes: 'Deep hardware content, sells educational kits',
  },
  {
    name: 'Reducible',
    channelId: 'UCK8XIGR5kRidIw2fWqwyHRA',
    handle: '@Reducible',
    policy: 'allow',
    topics: ['algorithms', 'CS theory', 'data structures'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'Sebastian Lague',
    channelId: 'UCmtyQOKKmrMVaKuRXz02jbQ',
    handle: '@SebastianLague',
    policy: 'allow',
    topics: ['game dev', 'algorithms', 'simulations', 'procedural'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'Corey Schafer',
    channelId: 'UCCezIgC97PvUuR4_gbFUs5g',
    handle: '@coreyms',
    policy: 'allow',
    topics: ['python', 'django', 'flask', 'git'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
    notes: 'Best Python tutorials, no selling',
  },
  {
    name: 'Socratica',
    channelId: 'UCW6TXMZ5Pq6yL6_k5NZ2e0Q',
    handle: '@Socratica',
    policy: 'allow',
    topics: ['python', 'math', 'science'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'mCoding',
    channelId: 'UCaiL2GDNpLYH6Wokkk1VNcg',
    handle: '@mCoding',
    policy: 'allow',
    topics: ['python', 'advanced programming'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },

  // Quality Tutorial Creators (Minimal Marketing)
  {
    name: 'Traversy Media',
    channelId: 'UC29ju8bIPH5as8OGnQzwJyA',
    handle: '@TraversyMedia',
    aliases: ['Brad Traversy'],
    policy: 'allow',
    topics: ['web dev', 'javascript', 'react', 'node'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
    notes: 'Tutorials are complete, course mentions are brief',
  },
  {
    name: 'The Net Ninja',
    channelId: 'UCW5YeuERMmlnqo4oq8vwUpg',
    handle: '@NetNinja',
    aliases: ['Net Ninja', 'Shaun Pelling'],
    policy: 'allow',
    topics: ['web dev', 'react', 'vue', 'node', 'firebase'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Fireship',
    channelId: 'UCsBjURrPoezykLs9EqgamOA',
    handle: '@Fireship',
    aliases: ['Jeff Delaney'],
    policy: 'allow',
    topics: ['all tech', 'web dev', 'quick explainers'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
    notes: 'Short format, good for concepts',
  },
  {
    name: 'Kevin Powell',
    channelId: 'UCJZv4d5rbIKd4QHMPkcABCw',
    handle: '@KevinPowell',
    policy: 'allow',
    topics: ['CSS', 'frontend', 'responsive design'],
    contentQuality: 'excellent',
    marketingLevel: 'light',
    canEmbedCommercially: true,
    notes: 'CSS master',
  },
  {
    name: 'Web Dev Simplified',
    channelId: 'UCFbNIlppjAuEX4znoulh0Cw',
    handle: '@WebDevSimplified',
    aliases: ['Kyle Cook'],
    policy: 'allow',
    topics: ['javascript', 'react', 'web dev'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Jack Herrington',
    channelId: 'UC6vRUjYqDuoUsYsku86Lrsw',
    handle: '@jherr',
    policy: 'allow',
    topics: ['react', 'typescript', 'frontend architecture'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'Theo',
    channelId: 'UCbRP3c757lWg9M-U7TyEkXA',
    handle: '@t3dotgg',
    aliases: ['t3.gg', 'Theo Browne'],
    policy: 'allow',
    topics: ['react', 'typescript', 'next.js', 'trpc'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Sentdex',
    channelId: 'UCfzlCWGWYyIQ0aLC5w48gBQ',
    handle: '@sentdex',
    aliases: ['Harrison Kinsley'],
    policy: 'allow',
    topics: ['python', 'machine learning', 'data science', 'finance'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Tech With Tim',
    channelId: 'UC4JX40jDee_tINbkjycV4Sg',
    handle: '@TechWithTim',
    policy: 'allow',
    topics: ['python', 'pygame', 'AI'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Arjan Codes',
    channelId: 'UCVhQ2NnY5Rskt6UjCUkJ_DA',
    handle: '@ArjanCodes',
    policy: 'allow',
    topics: ['python', 'software design', 'clean code'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },

  // Official Channels
  {
    name: 'Google Developers',
    channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
    handle: '@GoogleDevelopers',
    policy: 'allow',
    topics: ['google tech', 'web', 'android', 'AI'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Chrome for Developers',
    channelId: 'UCnUYZLuoy1rq1aVMwx4aTzw',
    handle: '@ChromeDevs',
    aliases: ['Google Chrome Developers'],
    policy: 'allow',
    topics: ['chrome', 'web performance', 'PWA'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },
  {
    name: 'Microsoft Developer',
    channelId: 'UCsMica-v34Irf9KVTh6xx-g',
    handle: '@MicrosoftDeveloper',
    policy: 'allow',
    topics: ['azure', '.NET', 'VS Code', 'typescript'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'GitHub',
    channelId: 'UC7c3Kb6jYCRj4JOHHZTxKsQ',
    handle: '@GitHub',
    policy: 'allow',
    topics: ['git', 'github', 'open source', 'actions'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'MongoDB',
    channelId: 'UCKCDhm4ALTXnjPYV_OhEqPw',
    handle: '@MongoDB',
    policy: 'allow',
    topics: ['mongodb', 'databases', 'nosql'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Vercel',
    channelId: 'UCLq8gNoee7oXM7MvTdjyQvA',
    handle: '@vercel',
    policy: 'allow',
    topics: ['next.js', 'deployment', 'frontend'],
    contentQuality: 'good',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },

  // Game Dev
  {
    name: 'Brackeys',
    channelId: 'UCYbK_tjZ2OrIZFBvU6CCMiA',
    handle: '@Brackeys',
    policy: 'allow',
    topics: ['unity', 'game dev', 'C#'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
    notes: 'Retired but archive is gold',
  },
  {
    name: "Game Maker's Toolkit",
    channelId: 'UCqJ-Xo29CKyLTjn6z2XwYAw',
    handle: '@GMTK',
    aliases: ['GMTK'],
    policy: 'allow',
    topics: ['game design'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },

  // Physical Skills
  {
    name: 'JustinGuitar',
    channelId: 'UCBNwixBA4HMkjuNxL4_S-Dw',
    handle: '@justinguitar',
    policy: 'allow',
    topics: ['guitar'],
    contentQuality: 'excellent',
    marketingLevel: 'light',
    canEmbedCommercially: true,
    notes: 'Best free guitar lessons',
  },
  {
    name: 'Jeff Nippard',
    channelId: 'UC68TLK0mAEzUyLx5x5aws-Q',
    handle: '@JeffNippard',
    policy: 'allow',
    topics: ['fitness', 'science-based training'],
    contentQuality: 'excellent',
    marketingLevel: 'light',
    canEmbedCommercially: true,
  },
  {
    name: 'Hybrid Calisthenics',
    channelId: 'UCeJFgNahi--rwEJuGPPENYw',
    handle: '@HybridCalisthenics',
    aliases: ['Hampton'],
    policy: 'allow',
    topics: ['calisthenics', 'bodyweight', 'flexibility'],
    contentQuality: 'excellent',
    marketingLevel: 'none',
    canEmbedCommercially: true,
  },

  // ═══════════════════════════════════════════
  // DEPRIORITIZE: Has Value, But Heavy Marketing
  // ═══════════════════════════════════════════

  {
    name: 'Programming with Mosh',
    channelId: 'UCWv7vMbMWH4-V0ZXdmDpPBA',
    handle: '@programmingwithmosh',
    aliases: ['Mosh Hamedani'],
    policy: 'deprioritize',
    topics: ['python', 'javascript', 'react', 'node'],
    contentQuality: 'good',
    marketingLevel: 'heavy',
    canEmbedCommercially: true,
    notes: 'Quality content but often incomplete, promotes paid courses',
  },
  {
    name: 'Code with Chris',
    channelId: 'UC2D6eRvCeMtcF5OGHf1-trw',
    handle: '@CodeWithChris',
    policy: 'deprioritize',
    topics: ['iOS', 'swift', 'app development'],
    contentQuality: 'good',
    marketingLevel: 'heavy',
    canEmbedCommercially: true,
    notes: 'Primarily sells courses, but has some good free content',
  },
  {
    name: 'Academind',
    channelId: 'UCSJbGtTlrDami-tDGPUV9-w',
    handle: '@academind',
    aliases: ['Maximilian Schwarzmuller'],
    policy: 'deprioritize',
    topics: ['web dev', 'react', 'node', 'angular'],
    contentQuality: 'good',
    marketingLevel: 'heavy',
    canEmbedCommercially: true,
    notes: 'Good explanations but heavy Udemy promotion',
  },
  {
    name: 'DesignCourse',
    channelId: 'UCVyRiMvfUNMA1UPlDPzG5Ow',
    handle: '@DesignCourse',
    aliases: ['Gary Simon'],
    policy: 'deprioritize',
    topics: ['UI/UX', 'figma', 'web design'],
    contentQuality: 'good',
    marketingLevel: 'moderate',
    canEmbedCommercially: true,
  },
  {
    name: 'NetworkChuck',
    channelId: 'UC9x0AN7BWHpCDHSm9NiJFJQ',
    handle: '@NetworkChuck',
    policy: 'deprioritize',
    topics: ['networking', 'linux', 'devops', 'security'],
    contentQuality: 'good',
    marketingLevel: 'moderate',
    canEmbedCommercially: true,
    notes: 'Engaging but mentions sponsors frequently',
  },
  {
    name: 'TechWorld with Nana',
    channelId: 'UCdngmbVKX1Tgre699-XLlUA',
    handle: '@TechWorldwithNana',
    policy: 'deprioritize',
    topics: ['devops', 'kubernetes', 'docker', 'CI/CD'],
    contentQuality: 'good',
    marketingLevel: 'moderate',
    canEmbedCommercially: true,
  },
  {
    name: 'Amigoscode',
    channelId: 'UC2KfmYEM4KCuA1ZurravgYw',
    handle: '@amigoscode',
    policy: 'deprioritize',
    topics: ['java', 'spring', 'backend'],
    contentQuality: 'good',
    marketingLevel: 'moderate',
    canEmbedCommercially: true,
  },
  {
    name: 'Colt Steele',
    channelId: 'UCrqAGUPPMOdo0jfQ6grikZw',
    handle: '@ColtSteeleCode',
    policy: 'deprioritize',
    topics: ['web dev', 'javascript'],
    contentQuality: 'good',
    marketingLevel: 'heavy',
    canEmbedCommercially: true,
    notes: 'Has valuable content but primarily sells Udemy courses',
  },
  {
    name: 'Angela Yu',
    channelId: 'UCGwuxdEeCf0TIA2RbPOj-8g',
    handle: '@DrAngelaYu',
    aliases: ['London App Brewery', 'Dr Angela Yu'],
    policy: 'deprioritize',
    topics: ['web dev', 'iOS', 'flutter'],
    contentQuality: 'good',
    marketingLevel: 'heavy',
    canEmbedCommercially: true,
    notes: 'Content often previews for paid courses',
  },

  // ═══════════════════════════════════════════
  // BLOCK: Scams, MLM, Misleading Content
  // ═══════════════════════════════════════════

  {
    name: 'Clever Programmer',
    channelId: 'UCqrILQNl5Ed9Dz6CGMyvMTQ',
    handle: '@CleverProgrammer',
    policy: 'block',
    topics: ['web dev'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Clickbait, "get rich" messaging, aggressive marketing',
  },

  // ═══════════════════════════════════════════
  // BLOCK: SaaS Vendor Channels (Product Marketing)
  // These channels primarily promote their own products
  // ═══════════════════════════════════════════

  {
    name: 'Zapier',
    channelId: 'UCunNiNwxhVL74mlc_WsxDKQ',
    handle: '@zapier',
    policy: 'block',
    topics: ['automation'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - all content promotes Zapier product',
  },
  {
    name: 'Notion',
    channelId: 'UCoSvlWS5XcwaSzIcbuJ-Ysg',
    handle: '@Notion',
    policy: 'block',
    topics: ['productivity'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product demos and tours',
  },
  {
    name: 'Airtable',
    channelId: 'UCB6-t0OCU6WKz4cbtY1tS7A',
    handle: '@Airtable',
    policy: 'block',
    topics: ['databases'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product marketing',
  },
  {
    name: 'Make (Integromat)',
    channelId: 'UCqKjJYtzDvkdC0U6PJi30Iw',
    handle: '@make_com',
    policy: 'block',
    topics: ['automation'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - Zapier competitor',
  },
  {
    name: 'monday.com',
    channelId: 'UCQGGvUW9K-W-aU0RwYKKjWg',
    handle: '@mondaydotcom',
    policy: 'block',
    topics: ['project management'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product marketing',
  },
  {
    name: 'ClickUp',
    channelId: 'UCwJhgG4wEm8NI-1T3I4A6hw',
    handle: '@ClickUp',
    policy: 'block',
    topics: ['project management'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product marketing',
  },
  {
    name: 'Asana',
    channelId: 'UCDqgKWdY9FI4rOXt1FvG-tQ',
    handle: '@Asana',
    policy: 'block',
    topics: ['project management'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product marketing',
  },
  {
    name: 'HubSpot',
    channelId: 'UCTcWGr2i2qK4FnZhmLdKyJg',
    handle: '@HubSpot',
    policy: 'block',
    topics: ['marketing', 'CRM'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product marketing',
  },
  {
    name: 'Salesforce',
    channelId: 'UCovELdGb-dBD7BrxvuYI-yA',
    handle: '@salesforce',
    policy: 'block',
    topics: ['CRM', 'enterprise'],
    contentQuality: 'acceptable',
    marketingLevel: 'heavy',
    canEmbedCommercially: false,
    notes: 'Vendor channel - product marketing',
  },
];

// ============================================
// CONTENT SIGNALS (For post-retrieval filtering)
// ============================================

export const CONTENT_SIGNALS = {
  // POSITIVE: Prefer videos with these
  positive: {
    high: [
      'has chapters',
      'has timestamps',
      'has code repository',
      'has github link',
      'build project',
      'from scratch',
      'step by step',
      'complete tutorial',
    ],
    medium: [
      'tutorial',
      'explained',
      'how to',
      'for beginners',
      'crash course',
      'fundamentals',
      'in depth',
    ],
  },

  // NEGATIVE: Deprioritize videos with these
  negative: {
    soft: [
      'roadmap',
      'my journey',
      'watch this first',
      'my story',
      'day in the life',
      'vlog',
      'reaction',
      'made simple',
      'made easy',
      'must watch',
      'you need to know',
      'in 2024',
      'in 2025',
      'in 2026',
      'game changer',
      'mind blowing',
    ],
    hard: [
      // Direct sales/marketing
      'coupon code',
      '% off',
      'limited time offer',
      'enroll now',
      'sign up free',
      'start free trial',
      'get started free',
      'try it free',
      'link in description',
      'link below',
      'affiliate',

      // Hustle/scam content
      'quit your job',
      'make money',
      'get rich',
      'passive income',
      'side hustle',
      'crypto tutorial',
      'nft tutorial',

      // Teaser/upsell content
      'free course preview',
      'full course available',
      'full course on',
      'enroll in my course',
      'join my course',
      'buy my course',
      'premium course',

      // Vendor marketing
      'official tutorial',
      'product demo',
      'product tour',
      'product overview',
      'platform overview',
      'platform tour',
      'getting started with our',
      'introduction to our',

      // Sponsored/comparison bait
      'sponsored',
      'this video is sponsored',
      'thanks to',
      'partnered with',
      'paid promotion',

      // Review/comparison (often sponsored)
      'honest review',
      'full review',
      'vs comparison',
      'which is better',
      'best tool for',
      'best software for',
      'top 10',
      'top 5',
      'best of',

      // Clickbait patterns
      'you won\'t believe',
      'secret',
      'hack',
      'trick',
      'nobody talks about',
      'they don\'t want you to know',
    ],
  },

  // TRANSCRIPT: Promotional keywords to detect in video content (FREE scan)
  // These catch vendor marketing that has clean titles but promotional content
  transcript: {
    // Strong promotional signals - reject if 2+ found
    strong: [
      'paid promotion',
      'paid partnership',
      'sponsored by',
      'thanks to our sponsor',
      'sign up for free',
      'start your free trial',
      'link in the description',
      'click the link below',
      'use my code',
      'use code',
      'discount code',
      'promo code',
      'special offer',
      'limited time',
      "we've built",
      'we designed',
      'our platform',
      'our product',
      'our tool',
      'our software',
      'our solution',
    ],
    // Vendor self-promotion patterns
    vendor: [
      'at zapier we',
      'at notion we',
      'at airtable we',
      'at monday we',
      'at clickup we',
      'at asana we',
      'at hubspot we',
      'here at',
      'our team',
      'our company',
      'our customers',
      'our users love',
      'with our',
      'using our',
    ],
    // Call-to-action patterns
    cta: [
      'get started today',
      'try it now',
      'sign up now',
      'create your account',
      'start automating',
      'join thousands',
      'join millions',
      'check out the link',
      'head over to',
    ],
  },
};

// ============================================
// CHANNEL LOOKUP
// ============================================

export function findChannel(identifier: string): YouTubeChannel | null {
  const normalized = identifier.toLowerCase().trim();

  return CHANNEL_DATABASE.find(channel => {
    // Match by channelId (exact)
    if (channel.channelId.toLowerCase() === normalized) return true;

    // Match by handle (exact, without @)
    const handle = channel.handle?.replace('@', '').toLowerCase();
    if (handle === normalized.replace('@', '')) return true;

    // Match by name (exact)
    if (channel.name.toLowerCase() === normalized) return true;

    // Match by alias (exact)
    if (channel.aliases?.some(a => a.toLowerCase() === normalized)) return true;

    return false;
  }) || null;
}

export function getChannelPolicy(identifier: string): {
  policy: ChannelPolicy;
  channel: YouTubeChannel | null;
  confidence: SignalConfidence;
} {
  const channel = findChannel(identifier);

  if (channel) {
    return {
      policy: channel.policy,
      channel,
      confidence: 'high',
    };
  }

  // Unknown channel - default to allow with low confidence
  return {
    policy: 'allow',
    channel: null,
    confidence: 'low',
  };
}

// ============================================
// VIDEO VALIDATOR & SCORER (Main scoring function)
// ============================================

export interface VideoValidationResult {
  isValid: boolean;
  score: number;             // 70-100 (min 70 for valid)
  policy: ChannelPolicy;
  contentCompleteness: ContentCompleteness;
  confidence: SignalConfidence;
  hardFlags: string[];       // Immediate rejection
  softWarnings: string[];    // Score reduction
  positiveSignals: string[]; // Score boost
  recommendation: 'use' | 'use_with_caution' | 'skip';
}

/**
 * Main scoring function for videos
 * Score starts at 70 (minimum for valid videos) and adjusts based on signals
 */
export function validateVideo(video: {
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  duration?: number;          // seconds
  hasChapters?: boolean;
  hasRepository?: boolean;
}): VideoValidationResult {
  const hardFlags: string[] = [];
  const softWarnings: string[] = [];
  const positiveSignals: string[] = [];

  // Start at 70 (minimum for valid videos)
  let score = 70;

  // 1. Check channel policy
  const channelCheck = getChannelPolicy(video.channelId) ||
                       getChannelPolicy(video.channelName);

  if (channelCheck.policy === 'block') {
    hardFlags.push(`Channel "${video.channelName}" is blocked`);
    score = 0;
  } else if (channelCheck.policy === 'deprioritize') {
    softWarnings.push(`Channel "${video.channelName}" has heavy marketing`);
    score -= 5; // Small penalty, still above 70
  } else if (channelCheck.channel) {
    // Known good channel - bonus based on quality
    positiveSignals.push(`Verified channel: ${video.channelName}`);

    // Quality bonus: 0-15 points
    const qualityBonus: Record<string, number> = {
      excellent: 15,
      good: 8,
      acceptable: 0,
    };
    score += qualityBonus[channelCheck.channel.contentQuality] || 0;

    // Marketing penalty: 0-5 points (smaller than deprioritize)
    const marketingPenalty: Record<string, number> = {
      none: 0,
      light: 2,
      moderate: 4,
      heavy: 5,
    };
    score -= marketingPenalty[channelCheck.channel.marketingLevel] || 0;
  }

  const titleLower = video.title.toLowerCase();
  const descLower = video.description.toLowerCase();
  const combined = titleLower + ' ' + descLower;

  // 2. Check for HARD red flags (immediate rejection)
  for (const flag of CONTENT_SIGNALS.negative.hard) {
    if (combined.includes(flag.toLowerCase())) {
      hardFlags.push(`Contains "${flag}"`);
      score -= 30;
    }
  }

  // 3. Check for SOFT warnings (small score reduction)
  for (const flag of CONTENT_SIGNALS.negative.soft) {
    if (combined.includes(flag.toLowerCase())) {
      softWarnings.push(`Contains "${flag}"`);
      score -= 1; // Small penalty
    }
  }

  // 4. Check for positive signals (bonus points)
  for (const signal of CONTENT_SIGNALS.positive.high) {
    if (combined.includes(signal.toLowerCase())) {
      positiveSignals.push(signal);
      score += 3;
    }
  }
  for (const signal of CONTENT_SIGNALS.positive.medium) {
    if (titleLower.includes(signal.toLowerCase())) {
      positiveSignals.push(signal);
      score += 1;
    }
  }

  // 5. Bonus for chapters/repo
  if (video.hasChapters) {
    positiveSignals.push('Has chapters/timestamps');
    score += 5;
  }
  if (video.hasRepository) {
    positiveSignals.push('Has code repository');
    score += 5;
  }

  // 6. Determine content completeness
  let contentCompleteness: ContentCompleteness = 'complete';
  if (descLower.includes('full course available') ||
      descLower.includes('preview') ||
      titleLower.includes('preview')) {
    contentCompleteness = 'preview';
    softWarnings.push('May be a course preview');
    score -= 3;
  } else if (descLower.includes('part 1') || titleLower.includes('part 1')) {
    contentCompleteness = 'partial';
  }

  // Enforce minimum 70 for valid videos, max 100
  const hasHardFlags = hardFlags.length > 0;
  if (!hasHardFlags) {
    score = Math.max(70, Math.min(100, score));
  } else {
    score = Math.max(0, Math.min(100, score));
  }

  // Determine recommendation
  let recommendation: 'use' | 'use_with_caution' | 'skip';
  if (hasHardFlags || score < 50) {
    recommendation = 'skip';
  } else if (softWarnings.length > 3 || score < 75) {
    recommendation = 'use_with_caution';
  } else {
    recommendation = 'use';
  }

  // Allow videos with hard flags if score is still decent (50+)
  // This prevents over-filtering of educational content with minor marketing
  return {
    isValid: score >= 50,
    score,
    policy: channelCheck.policy,
    contentCompleteness,
    confidence: channelCheck.confidence,
    hardFlags,
    softWarnings,
    positiveSignals,
    recommendation,
  };
}

/**
 * Rank videos by validation score (uses validateVideo)
 * Returns videos sorted by score, with invalid videos filtered out
 */
export function rankVideos<T extends {
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  duration?: number;
  hasChapters?: boolean;
  hasRepository?: boolean;
}>(videos: T[]): Array<T & { validationResult: VideoValidationResult }> {
  return videos
    .map(video => ({
      ...video,
      validationResult: validateVideo(video),
    }))
    .filter(v => v.validationResult.isValid)
    .sort((a, b) => b.validationResult.score - a.validationResult.score);
}

// ============================================
// SEARCH HELPERS
// ============================================

export function buildSearchQuery(
  topic: string,
  skillLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): string {
  const levelModifier = {
    beginner: 'tutorial for beginners',
    intermediate: 'tutorial',
    advanced: 'in depth advanced',
  };

  return `${topic} ${levelModifier[skillLevel]}`;
}

/**
 * Get all preferred channels (ALLOW policy only)
 * Topic filtering removed - YouTube search + Layer 2 scoring handles relevance
 */
export function getPreferredChannelsForTopic(_topic?: string): YouTubeChannel[] {
  return CHANNEL_DATABASE.filter(c => c.policy === 'allow');
}

// ============================================
// PROMPT FOR AI (Video selection rules)
// ============================================

export const VIDEO_SELECTION_PROMPT = `
VIDEO SOURCE SELECTION RULES

CHANNEL PRIORITY (in order):

1. ALLOW - Education-First Channels:
   - freeCodeCamp, Khan Academy, MIT OCW
   - 3Blue1Brown, The Coding Train, Computerphile
   - Corey Schafer, StatQuest, Ben Eater
   - Traversy Media, Net Ninja, Kevin Powell
   - Fireship, Web Dev Simplified, Jack Herrington
   - Official channels: Google, Microsoft, GitHub

2. DEPRIORITIZE - Has Value But Heavy Marketing:
   - Programming with Mosh - Good content, heavy course promo
   - Academind - Good explanations, heavy Udemy promo
   - Code with Chris - iOS focused, course-selling
   - NetworkChuck - Engaging but sponsor-heavy

   Use ONLY if topic not covered by ALLOW channels

3. BLOCK - Scam/Misleading:
   - Clever Programmer - Clickbait, "get rich" messaging
   - Crypto/NFT tutorial channels
   - "Make money coding" channels

   NEVER use these

PREFER VIDEOS WITH:
- Chapters/timestamps (organized content)
- Code repository link (practical)
- "Build X" or "from scratch" (project-based)
- Complete tutorial (not preview)

AVOID VIDEOS WITH:
- "Roadmap", "my journey", "day in the life" (not tutorials)
- Heavy sponsor segments
- "Coupon code", "% off", "enroll now" (course ads)
- "Quit your job", "make money", "get rich" (scam signals)
- "Free preview", "full course available" (incomplete)
`;
