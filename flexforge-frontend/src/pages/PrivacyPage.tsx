import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="prose prose-gray max-w-none">
          <h2>1. Introduction</h2>
          <p>
            FlexForge ("we", "our", or "us") is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, and safeguard your information
            when you use our learning platform.
          </p>

          <h2>2. Information We Collect</h2>

          <h3>Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, and password when you register</li>
            <li><strong>Learning Preferences:</strong> Your learning goals, skill levels, and preferences</li>
            <li><strong>User Content:</strong> Responses to exercises, reflection notes, and project submissions</li>
            <li><strong>Communications:</strong> Messages you send to our support team</li>
          </ul>

          <h3>Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Pages visited, features used, time spent learning</li>
            <li><strong>Progress Data:</strong> Quiz scores, completion rates, learning streaks</li>
            <li><strong>Device Information:</strong> Browser type, operating system, device type</li>
            <li><strong>Log Data:</strong> IP address, access times, referring URLs</li>
          </ul>

          <h2>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide and personalize the learning experience</li>
            <li>Generate AI-powered curriculum recommendations</li>
            <li>Track your progress and provide feedback</li>
            <li>Improve our AI models and content quality</li>
            <li>Send important account and service updates</li>
            <li>Respond to your questions and support requests</li>
            <li>Prevent fraud and ensure platform security</li>
          </ul>

          <h2>4. AI Processing</h2>
          <p>
            Your learning data may be processed by AI systems to:
          </p>
          <ul>
            <li>Generate personalized curricula and content</li>
            <li>Provide AI tutor responses</li>
            <li>Analyze learning patterns to improve recommendations</li>
            <li>Evaluate exercise responses</li>
          </ul>
          <p>
            We use third-party AI providers (such as Anthropic) to power these features.
            Your data is processed according to their privacy policies and our data processing agreements.
          </p>

          <h2>5. Data Sharing</h2>
          <p>We do not sell your personal information. We may share data with:</p>
          <ul>
            <li><strong>Service Providers:</strong> Third parties that help us operate the platform (hosting, analytics, AI providers)</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
          </ul>

          <h2>6. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your data, including:
          </p>
          <ul>
            <li>Encryption of data in transit and at rest</li>
            <li>Secure authentication with HTTP-only cookies</li>
            <li>Regular security audits and updates</li>
            <li>Access controls and monitoring</li>
          </ul>
          <p>
            However, no method of transmission over the Internet is 100% secure.
            We cannot guarantee absolute security.
          </p>

          <h2>7. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active or as needed to provide services.
            You can request deletion of your account and associated data at any time.
          </p>

          <h2>8. Your Rights</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your data in a portable format</li>
            <li>Opt out of certain data processing</li>
          </ul>
          <p>
            To exercise these rights, contact us at{' '}
            <a href="mailto:privacy@flexforge.ai" className="text-brand-600 hover:underline">
              privacy@flexforge.ai
            </a>
          </p>

          <h2>9. Cookies</h2>
          <p>
            We use essential cookies for authentication and security.
            We may also use analytics cookies to understand how the platform is used.
            You can control cookie preferences through your browser settings.
          </p>

          <h2>10. Children's Privacy</h2>
          <p>
            FlexForge is not intended for children under 13. We do not knowingly collect
            information from children under 13. If you believe we have collected such information,
            please contact us immediately.
          </p>

          <h2>11. International Users</h2>
          <p>
            Your data may be transferred to and processed in countries other than your own.
            We ensure appropriate safeguards are in place for international data transfers.
          </p>

          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by email or through the platform.
          </p>

          <h2>13. Contact Us</h2>
          <p>
            For questions about this Privacy Policy or our data practices, please contact us at{' '}
            <a href="mailto:privacy@flexforge.ai" className="text-brand-600 hover:underline">
              privacy@flexforge.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
