import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Bondoo" },
      {
        name: "description",
        content:
          "How Bondoo collects, uses, and protects your data — including verification documents and chat.",
      },
      { property: "og:title", content: "Privacy Policy — Bondoo" },
      {
        property: "og:description",
        content: "What we collect, why, and the controls you have over your data.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-ink">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to="/"
          className="text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold"
        >
          ← Bondoo
        </Link>
        <h1 className="display mt-4 text-4xl leading-tight text-ink">Privacy Policy</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Last updated · 21 July 2026
        </p>
        <p className="mt-3 text-xs font-semibold text-brand-orange">
          Bondoo is a proprietary product/unit of MAKE MY VASH (MMV).
        </p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink/85">
          <Section title="1. What we collect">
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Account: email, phone, name, avatar, date of birth.</li>
              <li>
                Verification: a government-issued ID document and a selfie
                (used only to verify identity — stored privately).
              </li>
              <li>Profile: bio, interests, city, availability windows.</li>
              <li>Activity: meetups you create/join, connections, chat messages.</li>
              <li>
                Device & usage: IP address, device model, OS, crash logs,
                approximate location if you allow it.
              </li>
            </ul>
          </Section>

          <Section title="2. Why we use it">
            To operate Bondoo — verify identity, compute your Trust Score,
            match you with nearby people, deliver chats and meetup details,
            prevent fraud, and comply with legal obligations.
          </Section>

          <Section title="3. Who can see what">
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <b>Public on Bondoo</b>: first name, avatar, bio, interests,
                Trust Score, verification badges.
              </li>
              <li>
                <b>Only you</b>: government ID document, phone, email, date of
                birth, blocked users, reports you filed.
              </li>
              <li>
                <b>Only your chat partner</b>: messages and meetup details in
                a conversation.
              </li>
            </ul>
          </Section>

          <Section title="4. Storage & security">
            Data is stored on secure managed infrastructure with row-level
            security. Government IDs and avatars are kept in private buckets
            accessible only via short-lived signed URLs. Passwords are hashed;
            traffic is encrypted in transit (TLS).
          </Section>

          <Section title="5. Sharing with third parties">
            We share data only with service providers strictly required to run
            Bondoo (hosting, auth, analytics, crash reporting, SMS if
            enabled). We never sell your personal data. We may disclose data
            when legally required, or to protect the safety of users.
          </Section>

          <Section title="6. Retention">
            We keep your data while your account is active. If you delete
            your account, we remove your profile, chats, connections, and
            verification documents within 30 days, except where retention is
            required by law (e.g. fraud/safety records).
          </Section>

          <Section title="7. Your rights">
            You can access, edit, export, or delete your data at any time from
            Profile → Account, or by writing to{" "}
            <a className="underline" href="mailto:privacy@bondoo.app">
              privacy@bondoo.app
            </a>
            . Depending on your country, you may also have the right to
            object, restrict processing, or lodge a complaint with a data
            protection authority.
          </Section>

          <Section title="8. Children">
            Bondoo is not for anyone under 14. We do not knowingly collect
            data from minors under 14. If you believe a minor has an account, contact
            us and we will remove it.
          </Section>

          <Section title="9. Changes">
            We may update this policy. Material changes will be highlighted in
            the app before they take effect.
          </Section>

          <Section title="10. Contact">
            Data controller: Bondoo (a proprietary product/unit of MAKE MY VASH (MMV)). Email{" "}
            <a className="underline" href="mailto:privacy@bondoo.app">
              privacy@bondoo.app
            </a>{" "}
            for any privacy questions or requests.
          </Section>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex gap-6 uppercase tracking-[0.22em]">
            <Link to="/terms" className="hover:text-ink">
              Terms of Service
            </Link>
            <Link to="/" className="hover:text-ink">
              Home
            </Link>
          </div>
          <p className="text-[11px] font-medium text-ink/70">
            Bondoo is a proprietary product/unit of MAKE MY VASH (MMV).
          </p>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display text-xl text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}