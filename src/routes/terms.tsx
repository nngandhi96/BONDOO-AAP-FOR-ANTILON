import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Bondoo" },
      {
        name: "description",
        content:
          "The terms that govern how you use Bondoo — a friendly, anti-loneliness app for real-world meetups.",
      },
      { property: "og:title", content: "Terms of Service — Bondoo" },
      {
        property: "og:description",
        content: "Rules of the road for using Bondoo safely and respectfully.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-ink">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to="/"
          className="text-[11px] uppercase tracking-[0.22em] text-brand-orange font-semibold"
        >
          ← Bondoo
        </Link>
        <h1 className="display mt-4 text-4xl leading-tight text-ink">Terms of Service</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Last updated · 21 July 2026
        </p>
        <p className="mt-3 text-xs font-semibold text-brand-orange">
          Bondoo is a proprietary product/unit of MAKE MY VASH (MMV).
        </p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink/85">
          <Section title="1. Who can use Bondoo">
            Bondoo is a proprietary product/unit of MAKE MY VASH (MMV). You must be at least 18 years old and legally able to enter into a
            contract. Bondoo is a platform for platonic, real-world social
            connection — not a dating service, marketplace, or professional
            network.
          </Section>

          <Section title="2. Your account">
            You are responsible for keeping your login credentials safe and for
            any activity that happens under your account. Provide accurate
            information during onboarding, verification, and profile setup.
          </Section>

          <Section title="3. Meetups & personal safety">
            Bondoo helps you discover people and propose meetups. Any meetup
            happens in the real world, at your own choice and risk. Meet in
            public places, tell someone you trust, and follow the in-app
            safety guidelines. Bondoo is not liable for the conduct of other
            users during or after a meetup.
          </Section>

          <Section title="4. Community rules">
            You agree not to harass, threaten, deceive, solicit, spam, or share
            unlawful, hateful, or sexually explicit content. Do not use Bondoo
            for dating solicitation, commercial promotion, or to arrange the
            exchange of money or goods. Violations can result in warnings,
            reduced Trust Score, or account removal.
          </Section>

          <Section title="5. Verification & Trust Score">
            Phone, ID, and community signals feed into your Trust Score. We
            may re-verify, request additional information, or restrict access
            if we suspect fraud or unsafe behaviour.
          </Section>

          <Section title="6. Content you share">
            You retain ownership of your photos, bio, and messages. By posting
            them on Bondoo, you grant us a limited license to host, display,
            and moderate that content solely to operate the service.
          </Section>

          <Section title="7. Reporting & moderation">
            Reports are reviewed by our moderation team. We may remove content,
            suspend accounts, or cooperate with law enforcement when required
            by law or to protect users.
          </Section>

          <Section title="8. Termination">
            You can delete your account at any time from Profile → Account. We
            may suspend or terminate accounts that violate these terms or put
            other users at risk.
          </Section>

          <Section title="9. Disclaimers">
            Bondoo is provided "as is". We do not guarantee that other users
            are who they claim to be, that meetups will be safe, or that the
            service will be uninterrupted. To the fullest extent permitted by
            law, our liability is limited.
          </Section>

          <Section title="10. Changes">
            We may update these terms. Material changes will be announced in
            the app. Continued use after changes means you accept the updated
            terms.
          </Section>

          <Section title="11. Contact">
            Questions? Reach us at{" "}
            <a className="underline" href="mailto:hello@bondoo.app">
              hello@bondoo.app
            </a>
            .
          </Section>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex gap-6 uppercase tracking-[0.22em]">
            <Link to="/privacy" className="hover:text-ink">
              Privacy Policy
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
      <p className="mt-2">{children}</p>
    </section>
  );
}