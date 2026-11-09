import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: 10 November 2026. This policy is written with Indonesia&apos;s Personal Data Protection Law (UU PDP No. 27/2022) in mind.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> email address and authentication details (or your Google account identifier if you sign in with Google).</li>
        <li><strong>Profile data:</strong> name, date of birth, gender, preferences, city and province, bio, interests, lifestyle answers and photos.</li>
        <li><strong>Chemistry answers:</strong> your questionnaire responses.</li>
        <li><strong>Activity:</strong> likes, passes, matches, messages, reports and blocks.</li>
      </ul>
      <h2>What others can see</h2>
      <p>Other members see your name, age (never your date of birth), city, bio, interests, lifestyle details, approved photos and your chemistry score with them. They never see your email, exact location, or individual questionnaire answers.</p>
      <h2>Location</h2>
      <p>We do not collect GPS coordinates. We store only the city and province you enter. We remove location metadata (EXIF/GPS) from every uploaded photo.</p>
      <h2>Photos</h2>
      <p>Photos are stored in private cloud storage and displayed only through short-lived signed links to people allowed to view your profile. Original uploads are never stored: we keep only a re-encoded copy without location or camera data.</p>
      <h2>How we use data</h2>
      <ul>
        <li>To provide matching, chemistry scores, messaging and notifications.</li>
        <li>To keep the community safe: moderation, fraud and abuse prevention.</li>
        <li>We do not sell your personal data and we do not use paid AI services to analyse your profile.</li>
      </ul>
      <h2>Service providers</h2>
      <p>Supabase (database and authentication), Railway (hosting and image storage) process data on our behalf.</p>
      <h2>Retention and deletion</h2>
      <p>You can delete your account in Settings. This permanently removes your profile, photos, answers, matches and messages. To protect other members, records of safety reports and moderation decisions are retained with only an anonymous identifier.</p>
      <h2>Your rights</h2>
      <p>You may access, correct or delete your data, and withdraw consent, by using the in-app settings or contacting us.</p>
    </>
  );
}
