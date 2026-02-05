import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="prose prose-gray max-w-none">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using FlexForge ("the Service"), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            FlexForge is an AI-powered learning platform that generates personalized curricula and educational content.
            The Service includes:
          </p>
          <ul>
            <li>AI-generated learning curricula and content</li>
            <li>Video recommendations and educational materials</li>
            <li>Interactive exercises and quizzes</li>
            <li>AI tutor assistance</li>
            <li>Progress tracking features</li>
          </ul>

          <h2>3. AI-Generated Content Disclaimer</h2>
          <p className="font-semibold text-gray-900">
            IMPORTANT: Content on this platform is generated using artificial intelligence and may contain errors,
            inaccuracies, or outdated information.
          </p>
          <ul>
            <li>AI-generated content is provided "as is" without warranty of accuracy or completeness</li>
            <li>You are responsible for verifying any information before relying on it</li>
            <li>The Service does not guarantee any specific learning outcomes or results</li>
            <li>AI recommendations should not be considered professional advice</li>
          </ul>

          <h2>4. Not Professional Advice</h2>
          <p>
            The content provided through FlexForge is for educational and informational purposes only.
            It does not constitute:
          </p>
          <ul>
            <li>Professional, legal, medical, financial, or career advice</li>
            <li>A substitute for consultation with qualified professionals</li>
            <li>Certification or accreditation of any kind</li>
          </ul>
          <p>
            Always consult appropriate professionals for specific advice related to your situation.
          </p>

          <h2>5. User Responsibilities</h2>
          <p>You agree to:</p>
          <ul>
            <li>Provide accurate information when creating your account</li>
            <li>Keep your account credentials secure</li>
            <li>Use the Service only for lawful purposes</li>
            <li>Not share, redistribute, or sell content from the Service</li>
            <li>Not attempt to reverse engineer or exploit the Service</li>
          </ul>

          <h2>6. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and content (excluding third-party materials),
            is owned by FlexForge. You retain ownership of any original content you create using the Service.
          </p>

          <h2>7. Third-Party Content</h2>
          <p>
            The Service may include links to third-party websites, videos, or resources.
            We do not control or endorse third-party content and are not responsible for its accuracy or availability.
          </p>

          <h2>8. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, FLEXFORGE SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>Loss of profits, data, or opportunities</li>
            <li>Damages arising from use of AI-generated content</li>
            <li>Damages from service interruptions or errors</li>
            <li>Any decisions made based on content from the Service</li>
          </ul>

          <h2>9. Subscription and Payments</h2>
          <p>
            Some features require a paid subscription. By subscribing, you agree to pay the applicable fees.
            Subscriptions automatically renew unless cancelled before the renewal date.
          </p>

          <h2>10. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these terms.
            You may cancel your account at any time through your account settings.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the Service after changes
            constitutes acceptance of the new terms.
          </p>

          <h2>12. Contact</h2>
          <p>
            For questions about these Terms, please contact us at{' '}
            <a href="mailto:legal@flexforge.ai" className="text-brand-600 hover:underline">
              legal@flexforge.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
