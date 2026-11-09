import type { Metadata } from "next";

export const metadata: Metadata = { title: "Community Guidelines" };

export default function GuidelinesPage() {
  return (
    <>
      <h1>Community Guidelines</h1>
      <p>SPARK is for adults looking for genuine connection. These guidelines keep it kind, honest and safe.</p>
      <h2>Be real</h2>
      <ul>
        <li>Use recent photos that clearly show you. No celebrities, cartoons, or photos of other people pretending to be you.</li>
        <li>Be honest about your age and what you&apos;re looking for.</li>
      </ul>
      <h2>Be respectful</h2>
      <ul>
        <li>No harassment, threats, hate speech, or bullying — on SPARK or about people you met here.</li>
        <li>No unsolicited sexual content. Consent matters in every conversation.</li>
        <li>&quot;No&quot; or no reply is an answer. Don&apos;t keep messaging someone who isn&apos;t interested.</li>
      </ul>
      <h2>Photo rules</h2>
      <ul>
        <li>Your face should be visible in your main photo.</li>
        <li>No nudity, sexual content, violence, weapons, or images of minors on their own.</li>
        <li>No contact details, ads or watermarks in photos.</li>
      </ul>
      <h2>Never</h2>
      <ul>
        <li>Ask for money, gifts, crypto or investments.</li>
        <li>Promote products, services, or other platforms.</li>
        <li>Use SPARK if you are under 18.</li>
      </ul>
      <h2>Stay safe</h2>
      <ul>
        <li>Keep conversations on SPARK until you trust someone.</li>
        <li>Meet in public places and tell a friend your plans.</li>
        <li>Report anything that feels wrong. Reports are confidential. In an emergency, call 112.</li>
      </ul>
      <h2>Enforcement</h2>
      <p>Breaking these guidelines can lead to content removal, warnings, suspension, or a permanent ban.</p>
    </>
  );
}
