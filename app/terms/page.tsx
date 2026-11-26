import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms — Deal Room" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="November 26, 2026">
      <p>By creating a Deal Room account you agree to these terms.</p>
      <h2>Your outreach, your responsibility</h2>
      <ul>
        <li>You send emails from your own mailbox or sending domain, under your own name, and you are the sender under the law (for example CAN-SPAM, GDPR, PECR and CASL).</li>
        <li>You give a real postal address for your email footer, honor unsubscribes, and only contact businesses with a relevant, honest message.</li>
        <li>You follow the rules of the email provider you connect.</li>
        <li>You review what the agent writes, or switch on autopilot knowing it sends without review.</li>
      </ul>
      <h2>What we do</h2>
      <p>Deal Room finds companies, researches people, verifies emails, drafts and schedules emails, reads replies and stops sequences when people answer or unsubscribe. AI can make mistakes: check the facts in drafts before you approve them.</p>
      <h2>Plans and billing</h2>
      <p>Trials end on the date shown in the app; the agent pauses when a trial ends and your data stays. Paid plans renew monthly until you cancel, and cancelling stops the next renewal.</p>
      <h2>Acceptable use</h2>
      <p>No purchased lists, no misleading subject lines or identities, no harassment, and no use for anything illegal. We may pause an account that breaks these rules or harms deliverability for others.</p>
      <h2>Liability</h2>
      <p>The service is provided as is. Our total liability is limited to what you paid us in the last three months.</p>
    </LegalPage>
  );
}
