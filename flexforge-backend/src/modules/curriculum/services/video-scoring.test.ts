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
  calculateTotalScore,
  scoreMarketingPenalty,
  scoreChannelTrust,
  scoreConceptMatch,
  scoreCognitiveLoad,
} from '../utils/video-scoring.utils';

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
    const { total, scores } = calculateTotalScore(video, TEST_CONTEXT);
    goodScores.push(total);

    console.log(`✅ ${video.title.substring(0, 50)}...`);
    console.log(`   Channel: ${video.channelName}`);
    console.log(`   concept=${scores.conceptMatch} trust=${scores.channelTrust} cognitive=${scores.cognitiveLoad}`);
    console.log(`   duration=${scores.durationFit} engage=${scores.engagement} segment=${scores.segmentability}`);
    console.log(`   marketing=-${scores.marketingPenalty}`);
    console.log(`   TOTAL: ${total.toFixed(1)} | ${video.reason}`);
    console.log();
  }

  console.log('BAD VIDEOS:');
  console.log('-'.repeat(60));
  for (const video of BAD_VIDEOS) {
    const { total, scores } = calculateTotalScore(video, TEST_CONTEXT);
    badScores.push(total);

    console.log(`❌ ${video.title.substring(0, 50)}...`);
    console.log(`   Channel: ${video.channelName}`);
    console.log(`   concept=${scores.conceptMatch} trust=${scores.channelTrust} cognitive=${scores.cognitiveLoad}`);
    console.log(`   duration=${scores.durationFit} engage=${scores.engagement} segment=${scores.segmentability}`);
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

// Run
runTests();
