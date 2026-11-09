import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: 10 November 2026</p>
      <h2>1. Who can use SPARK</h2>
      <p>You must be at least 18 years old and legally able to enter into this agreement. We verify your date of birth during sign-up and may suspend accounts we believe belong to minors.</p>
      <h2>2. Your account</h2>
      <ul>
        <li>Provide accurate information, including your real age and your own photos.</li>
        <li>Keep your login secure. You are responsible for activity on your account.</li>
        <li>One personal account per person. Accounts may not be sold or transferred.</li>
      </ul>
      <h2>3. Acceptable use</h2>
      <p>You agree to follow our Community Guidelines. You must not harass, threaten, scam, impersonate, spam, solicit money, share sexual content without consent, or use SPARK for commercial purposes.</p>
      <h2>4. Content</h2>
      <p>You keep ownership of the content you upload. You grant SPARK a limited licence to store, process (for example resizing and removing location metadata) and display it to other users as part of the service. We may review, refuse or remove content that breaks these terms.</p>
      <h2>5. Chemistry scores</h2>
      <p>Chemistry scores are calculated from questionnaire answers and profile information. They are conversation starters, not predictions, and do not guarantee compatibility or the outcome of any relationship.</p>
      <h2>6. Safety</h2>
      <p>SPARK does not conduct criminal background checks. Use caution when communicating with or meeting anyone. Report anything concerning — our team reviews every report.</p>
      <h2>7. Paid features</h2>
      <p>SPARK is currently free. If paid features are introduced, their price and terms will be shown clearly before any purchase.</p>
      <h2>8. Suspension and termination</h2>
      <p>We may suspend or terminate accounts that violate these terms. You can delete your account at any time in Settings.</p>
      <h2>9. Liability</h2>
      <p>To the extent permitted by law, SPARK is provided &quot;as is&quot; and we are not liable for the conduct of users on or off the platform.</p>
      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of the Republic of Indonesia.</p>
    </>
  );
}
