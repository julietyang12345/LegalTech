/**
 * Video Scoring Test Cases
 * Run with: npx ts-node src/modules/curriculum/services/video-scoring.test.ts
 *
 * Tests the video scoring algorithm with known good/bad videos
 * to validate that weights are tuned correctly.
 */

import {
  ScoringVideo,
  ScoringContext,
  SCORING_WEIGHTS,
  MARKETING_WEIGHTS,
  scoreMarketingPenalty,
  scoreChannelTrust,
  scoreConceptMatch,
  scoreCognitiveLoad,
  scoreDurationFit,
  scoreEngagement,
  analyzePromoContent,
} from './video-scoring.utils';

// Test video with expected outcome
interface TestVideo extends ScoringVideo {
  expected: 'good' | 'bad';
  reason: string;
}

// Known GOOD videos (educational, independent creators)
const GOOD_VIDEOS: TestVideo[] = [
  {
    videoId: 'good1',
    title: 'React Hooks Tutorial for Beginners',
    description: 'Learn React hooks from scratch. We cover useState, useEffect, and custom hooks with practical examples.',
    channelId: 'UC29ju8bIPH5as8OGnQzwJyA', // Fireship
    channelName: 'Fireship',
    duration: 600,
    hasChapters: true,
    hasRepository: true,
    expected: 'good',
    reason: 'Trusted channel, educational, has chapters',
  },
  {
    videoId: 'good2',
    title: 'JavaScript Crash Course For Beginners',
    description: 'Complete JavaScript tutorial for beginners. Build real projects and understand the fundamentals.',
    channelId: 'UC29ju8bIPH5as8OGnQzwJyA',
    channelName: 'Traversy Media',
    duration: 900,
    hasChapters: true,
    hasRepository: false,
    expected: 'good',
    reason: 'Trusted channel, crash course, beginner-friendly',
  },
  {
    videoId: 'good3',
    title: 'Python for Data Science - Complete Tutorial',
    description: 'Step by step Python tutorial covering pandas, numpy, and data visualization.',
    channelId: 'corey',
    channelName: 'Corey Schafer',
    duration: 1200,
    hasChapters: true,
    hasRepository: true,
    expected: 'good',
    reason: 'Educational content, step by step, has repo',
  },
  {
    videoId: 'good4',
    title: 'TypeScript Tutorial - The Basics',
    description: 'Introduction to TypeScript. Learn types, interfaces, and how to set up a TypeScript project.',
    channelId: 'benawad',
    channelName: 'Ben Awad',
    duration: 480,
    hasChapters: false,
    hasRepository: true,
    expected: 'good',
    reason: 'Educational, beginner-focused, has repo',
  },
];

// Known BAD videos (promotional, vendor marketing, low quality)
const BAD_VIDEOS: TestVideo[] = [
  {
    videoId: 'bad1',
    title: 'Zapier AI Tutorial for Beginners: Automation Made Simple',
    description: 'Learn how to automate your workflow with Zapier. Sign up free and start automating today!',
    channelId: 'zapier',
    channelName: 'Zapier',
    duration: 420,
    hasChapters: false,
    hasRepository: false,
    expected: 'bad',
    reason: 'Vendor self-promotion, marketing language',
  },
  {
    videoId: 'bad2',
    title: 'Make Money Online with AI - Get Rich Quick',
    description: 'Discover how to make passive income using AI tools. Limited time offer - enroll now!',
    channelId: 'scammer',
    channelName: 'AI Money Guru',
    duration: 600,
    hasChapters: false,
    hasRepository: false,
    expected: 'bad',
    reason: 'Scam signals, get rich quick',
  },
  {
    videoId: 'bad3',
    title: 'Notion Tutorial - Product Demo and Tour',
    description: 'See all the amazing features Notion has to offer. Start free trial today!',
    channelId: 'notion',
    channelName: 'Notion',
    duration: 300,
    hasChapters: false,
    hasRepository: false,
    expected: 'bad',
    reason: 'Product demo, vendor marketing',
  },
  {
    videoId: 'bad4',
    title: 'My Journey Learning to Code - Day in the Life Vlog',
    description: 'Watch my story of learning to code. Subscribe for more vlogs!',
    channelId: 'vlogger',
    channelName: 'CodeVlogger',
    duration: 900,
    hasChapters: false,
    hasRepository: false,
    expected: 'bad',
    reason: 'Vlog, not educational, personal journey',
  },
  {
    videoId: 'bad5',
    title: 'Airtable Official Tutorial - Platform Overview',
    description: 'Get started with Airtable. This official tutorial shows you everything you need to know.',
    channelId: 'airtable',
    channelName: 'Airtable',
    duration: 480,
    hasChapters: true,
    hasRepository: false,
    expected: 'bad',
    reason: 'Official vendor tutorial, platform overview',
  },
];

// Test context
const TEST_CONTEXT: ScoringContext = {
  concept: 'automation with AI',
  userSlot: 10,
  userLevel: 'beginner',
};

// Calculate total score using same logic as service
function calculateScore(video: ScoringVideo, context: ScoringContext): { total: number; scores: Record<string, number> } {
  const weights = SCORING_WEIGHTS[context.userLevel];
  const mw = MARKETING_WEIGHTS[context.userLevel] ?? 0.4;

  const conceptMatchScore = scoreConceptMatch(video, context);
  const scores = {
    conceptMatch: conceptMatchScore,
    channelTrust: scoreChannelTrust(video),
    marketingPenalty: scoreMarketingPenalty(video),
    durationFit: scoreDurationFit(video, context),
    cognitiveLoad: scoreCognitiveLoad(video, context),
    engagement: scoreEngagement(video),
  };

  const total =
    scores.conceptMatch * weights.conceptMatch +
    scores.channelTrust * weights.channelTrust +
    scores.durationFit * weights.durationFit +
    scores.cognitiveLoad * weights.cognitiveLoad +
    scores.engagement * weights.engagement -
    scores.marketingPenalty * mw;

  return { total, scores };
}

function runTests() {
  console.log('='.repeat(60));
  console.log('VIDEO SCORING TEST');
  console.log('='.repeat(60));
  console.log(`Context: "${TEST_CONTEXT.concept}" | ${TEST_CONTEXT.userLevel} | ${TEST_CONTEXT.userSlot}min`);
  console.log();

  const goodScores: number[] = [];
  const badScores: number[] = [];

  console.log('GOOD VIDEOS:');
  console.log('-'.repeat(60));
  for (const video of GOOD_VIDEOS) {
    const { total, scores } = calculateScore(video, TEST_CONTEXT);
    goodScores.push(total);

    console.log(`✅ ${video.title.substring(0, 50)}...`);
    console.log(`   Channel: ${video.channelName}`);
    console.log(`   concept=${scores.conceptMatch} trust=${scores.channelTrust} cognitive=${scores.cognitiveLoad}`);
    console.log(`   duration=${scores.durationFit} engage=${scores.engagement}`);
    console.log(`   marketing=-${scores.marketingPenalty}`);
    console.log(`   TOTAL: ${total.toFixed(1)} | ${video.reason}`);
    console.log();
  }

  console.log('BAD VIDEOS:');
  console.log('-'.repeat(60));
  for (const video of BAD_VIDEOS) {
    const { total, scores } = calculateScore(video, TEST_CONTEXT);
    badScores.push(total);

    console.log(`❌ ${video.title.substring(0, 50)}...`);
    console.log(`   Channel: ${video.channelName}`);
    console.log(`   concept=${scores.conceptMatch} trust=${scores.channelTrust} cognitive=${scores.cognitiveLoad}`);
    console.log(`   duration=${scores.durationFit} engage=${scores.engagement}`);
    console.log(`   marketing=-${scores.marketingPenalty}`);
    console.log(`   TOTAL: ${total.toFixed(1)} | ${video.reason}`);
    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const avgGood = goodScores.reduce((a, b) => a + b, 0) / goodScores.length;
  const avgBad = badScores.reduce((a, b) => a + b, 0) / badScores.length;
  const minGood = Math.min(...goodScores);
  const maxBad = Math.max(...badScores);

  console.log(`Good videos avg: ${avgGood.toFixed(1)} (min: ${minGood.toFixed(1)})`);
  console.log(`Bad videos avg:  ${avgBad.toFixed(1)} (max: ${maxBad.toFixed(1)})`);
  console.log(`Separation gap:  ${(avgGood - avgBad).toFixed(1)}`);
  console.log();

  if (minGood > maxBad) {
    console.log('✅ PASS: All good videos score higher than all bad videos');
  } else {
    console.log('⚠️  OVERLAP: Some bad videos score higher than some good videos');
    console.log('   Consider adjusting weights or adding more signals');
  }

  if (avgGood - avgBad > 15) {
    console.log('✅ GOOD SEPARATION: >15 point gap between good and bad');
  } else if (avgGood - avgBad > 10) {
    console.log('⚠️  MODERATE SEPARATION: 10-15 point gap');
  } else {
    console.log('❌ POOR SEPARATION: <10 point gap - weights need tuning');
  }
}

// ============================================
// TRANSCRIPT PROMOTIONAL SCAN TESTS
// ============================================

interface TranscriptTestCase {
  name: string;
  transcript: string;
  expectedPromotional: boolean;
  reason: string;
}

const TRANSCRIPT_TEST_CASES: TranscriptTestCase[] = [
  // GOOD transcripts (educational)
  {
    name: 'Educational - React Tutorial',
    transcript: `Today we're going to learn about React hooks. First, let's understand what useState does.
    When you call useState, you get back an array with the current value and a setter function.
    Let me show you an example. Here we have a counter component. We declare our state like this.
    The beauty of hooks is that they let you use state in functional components.`,
    expectedPromotional: false,
    reason: 'Pure educational content, no promotional language',
  },
  {
    name: 'Educational - Python Data Science',
    transcript: `In this video we'll cover pandas dataframes. A dataframe is essentially a table with rows and columns.
    You can create one from a dictionary or by reading a CSV file. Let me demonstrate.
    Once you have your data loaded, you can use methods like head, describe, and info to explore it.
    Practice these operations on your own datasets to get comfortable with them.`,
    expectedPromotional: false,
    reason: 'Teaching focused, no marketing',
  },

  // BAD transcripts (promotional)
  {
    name: 'Promotional - Zapier Vendor',
    transcript: `Welcome to this Zapier tutorial. At Zapier we've built a platform that makes automation easy.
    Our platform connects over 5000 apps. With our tool you can automate any workflow.
    Sign up for free and start your automation journey. Our customers love how easy it is.
    Click the link in the description to get started today.`,
    expectedPromotional: true,
    reason: 'Vendor self-promotion, "our platform", "sign up for free", CTA',
  },
  {
    name: 'Promotional - Sponsored Content',
    transcript: `This video is a paid promotion by Notion. Thanks to our sponsor for making this possible.
    Notion is an amazing tool for productivity. You should definitely try it out.
    Use my code SAVE20 for a discount. Link in the description below.
    Start your free trial today and see why millions love Notion.`,
    expectedPromotional: true,
    reason: 'Paid promotion, sponsor, discount code, free trial CTA',
  },
  {
    name: 'Promotional - SaaS Product Tour',
    transcript: `Hey everyone, today I'm going to show you our new feature. Our team has been working hard on this.
    We designed this feature with our users in mind. Here at monday.com we believe in simplicity.
    Our customers have been asking for this. Join thousands of teams already using our solution.
    Head over to monday.com to get started.`,
    expectedPromotional: true,
    reason: 'Vendor language, "our team", "our customers", "here at"',
  },

  // EDGE CASES
  {
    name: 'Edge - Light Sponsor Mention',
    transcript: `Today's video is brought to you by a sponsor but let's get into the actual content.
    We're going to learn about machine learning fundamentals. Neural networks consist of layers.
    Each layer transforms the input data. The key is understanding backpropagation.
    Let me walk you through a simple example with code.`,
    expectedPromotional: false,
    reason: 'Brief sponsor mention but mostly educational',
  },
  {
    name: 'Edge - GitHub Link',
    transcript: `All the code for this tutorial is available on GitHub. Link in the description.
    Let's start coding our REST API. First we need to set up Express.
    I'll show you how to handle routes and middleware. This is a practical example.
    By the end you'll have a working API you can deploy.`,
    expectedPromotional: false,
    reason: 'GitHub link is educational, not promotional',
  },
];

function runTranscriptTests() {
  console.log();
  console.log('='.repeat(60));
  console.log('TRANSCRIPT PROMOTIONAL ANALYSIS TEST');
  console.log('='.repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const testCase of TRANSCRIPT_TEST_CASES) {
    // Convert transcript string to array format expected by analyzePromoContent
    const transcriptArray = testCase.transcript.split('\n').map((text, i) => ({
      text: text.trim(),
      start: i * 30, // Simulate 30 seconds per line
    })).filter(t => t.text.length > 0);

    const videoDuration = transcriptArray.length * 30;
    const result = analyzePromoContent(transcriptArray, videoDuration);

    // Map verdict to promotional boolean
    const isPromotional = result.verdict === 'reject' || result.promoLevel === 'strong';
    const isCorrect = isPromotional === testCase.expectedPromotional;

    if (isCorrect) {
      passed++;
      console.log(`✅ ${testCase.name}`);
    } else {
      failed++;
      console.log(`❌ ${testCase.name}`);
      console.log(`   Expected: ${testCase.expectedPromotional ? 'PROMOTIONAL' : 'EDUCATIONAL'}`);
      console.log(`   Got: ${isPromotional ? 'PROMOTIONAL' : 'EDUCATIONAL'}`);
    }

    console.log(`   Verdict: ${result.verdict} | PromoLevel: ${result.promoLevel}`);
    console.log(`   CTA Density: ${result.ctaDensity.toFixed(2)}/min | Teaching Ratio: ${result.teachingRatio.toFixed(2)}`);
    if (result.dominantTools.length > 0) {
      console.log(`   Tools: [${result.dominantTools.join(', ')}]`);
    }
    console.log(`   Penalty: ${result.totalPenalty}`);
    console.log(`   Reason: ${testCase.reason}`);
    console.log();
  }

  console.log('='.repeat(60));
  console.log(`TRANSCRIPT TEST RESULTS: ${passed}/${passed + failed} passed`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('✅ All transcript tests passed!');
  } else {
    console.log(`⚠️  ${failed} test(s) failed - review promo analysis thresholds`);
  }
}

// Run all tests
runTests();
runTranscriptTests();
