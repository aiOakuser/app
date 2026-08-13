import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenants";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session || session.tenantSlug !== slug) {
    redirect(`/t/${slug}/sign-in`);
  }

  async function signOut() {
    "use server";
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect(`/t/${slug}/sign-in`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-sm text-center">
        <span
          className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full text-xl"
          style={{ background: tenant.accentSoft, color: tenant.accent }}
          aria-hidden
        >
          ✓
        </span>
        <h1 className="mb-2 text-[22px] font-semibold text-neutral-900">
          You&rsquo;re signed in to {tenant.displayName}
        </h1>
        <p className="mb-8 text-[14.5px] text-neutral-500">
          Session verified for {session.phoneMasked} via GDH Appointments.
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-full border border-neutral-200 py-3.5 text-[15px] font-medium text-neutral-700 transition hover:border-neutral-300"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
