import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy — Deal Room" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="November 26, 2026">
      <p>Deal Room is an AI sales agent. This page explains what data it handles, for whom, and how you can stop it.</p>
      <h2>Our customers&apos; accounts</h2>
      <p>When you sign up we store your email, a scrypt hash of your password, your company website and your settings. Mailbox passwords and API keys you connect are stored encrypted (AES-256-GCM) and are only used to send your emails and read the replies to them.</p>
      <h2>People our customers contact</h2>
      <p>To find prospects, Deal Room collects business information from public sources: company websites, news, public job boards, public filings and professional profiles. For the people it contacts it keeps their name, job title, work email, company and the public signal that made them relevant, with its source link. Our customer decides who is contacted and is responsible for that outreach; Deal Room processes this data on their behalf.</p>
      <p>Every email includes a one-click unsubscribe link. Unsubscribing, or replying that you are not interested, adds your address to that sender&apos;s do-not-contact list right away, and you are never emailed by that sender again.</p>
      <h2>Service providers</h2>
      <p>We use: Render (hosting), Supabase (database), OpenAI (writing and classification), Telem and Glasser (public company data and email verification), Moss (search), and the email provider each customer connects. They process data only to provide their service to us.</p>
      <h2>Keeping and deleting data</h2>
      <p>Agent traces are kept 14 days. Account data is kept while the account is open and deleted on request. To see, correct or delete data about you, or to stop all contact, email the sender who wrote to you or reply to their email with &quot;remove me&quot;.</p>
    </LegalPage>
  );
}
