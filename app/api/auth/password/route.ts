import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { passwordMeetsRequirements } from "@/lib/validation/auth.validation";

export const runtime = "nodejs";

const schema = z
  .object({
    action: z.enum([
      "signup",
      "change",
      "reset",
      "set_password",
      "change_email",
      "change_email_verified",
    ]),
    password: z.string().min(1).max(256).optional(),
    currentPassword: z.string().min(1).max(256).optional(),
    nonce: z.string().trim().min(6).max(12).optional(),
    email: z.string().email().optional(),
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

async function updateAuthenticatedUser(
  url: string,
  key: string,
  token: string,
  attributes: Record<string, string>,
) {
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(attributes),
  });
  const result = (await response.json().catch(() => null)) as {
    msg?: string;
    message?: string;
    error_description?: string;
  } | null;
  return response.ok
    ? null
    : {
        message:
          result?.msg ??
          result?.message ??
          result?.error_description ??
          "Unable to update your account security settings.",
        status: response.status,
      };
}

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid account security request." }, { status: 400 });

  const data = input.data;
  if (data.action !== "change_email" && data.action !== "change_email_verified") {
    if (!data.password || !passwordMeetsRequirements(data.password))
      return Response.json(
        {
          error:
            "Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.",
        },
        { status: 400 },
      );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (data.action === "signup") {
    if (!data.email || !data.firstName || !data.lastName)
      return Response.json({ error: "Enter your email and name." }, { status: 400 });
    const auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signup, error } = await auth.auth.signUp({
      email: data.email.trim().toLowerCase(),
      password: data.password!,
      options: {
        emailRedirectTo: new URL("/auth/callback", request.url).toString(),
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
          role: "client",
        },
      },
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (!signup.user)
      return Response.json(
        { error: "Account creation was not confirmed." },
        { status: 503 },
      );
    return Response.json({ user: signup.user }, { status: 201 });
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return Response.json(
      { error: "Sign in to update your account security settings." },
      { status: 401 },
    );

  const scoped = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await scoped.auth.getUser(token);
  if (authError || !auth.user)
    return Response.json(
      { error: "Your session expired. Please sign in again." },
      { status: 401 },
    );

  const providers = new Set([
    ...(auth.user.identities ?? []).map((identity) => identity.provider),
    ...(Array.isArray(auth.user.app_metadata?.providers)
      ? (auth.user.app_metadata.providers as string[])
      : []),
  ]);
  const hasPasswordCredential = providers.has("email");

  if (data.action === "set_password") {
    if (hasPasswordCredential)
      return Response.json(
        { error: "This account already has an email sign-in credential. Use Change Password and verify your current password." },
        { status: 409 },
      );
    if (!data.password || !data.nonce)
      return Response.json(
        { error: "Set a new password and enter the verification code sent to your current email." },
        { status: 400 },
      );
    const updateError = await updateAuthenticatedUser(url, key, token, {
      password: data.password,
      nonce: data.nonce,
    });
    if (updateError)
      return Response.json({ error: updateError.message }, { status: updateError.status });
    return Response.json({ ok: true });
  }

  if (data.action === "change_email_verified") {
    if (hasPasswordCredential)
      return Response.json(
        { error: "This account has an email sign-in credential. Enter your current password to change email." },
        { status: 409 },
      );
    if (!data.email || !data.nonce)
      return Response.json(
        { error: "Enter the new email address and the verification code sent to your current email." },
        { status: 400 },
      );
    const nextEmail = data.email.trim().toLowerCase();
    if (nextEmail === auth.user.email?.toLowerCase())
      return Response.json(
        { error: "Enter an email address different from your current one." },
        { status: 400 },
      );
    const updateError = await updateAuthenticatedUser(url, key, token, {
      email: nextEmail,
      nonce: data.nonce,
    });
    if (updateError)
      return Response.json({ error: updateError.message }, { status: updateError.status });
    return Response.json({ ok: true });
  }

  if (data.action === "change_email") {
    if (!hasPasswordCredential)
      return Response.json(
        { error: "This account has no email password. Request a verification code instead." },
        { status: 409 },
      );
    if (!data.email || !data.currentPassword)
      return Response.json(
        { error: "Enter your new email and current password." },
        { status: 400 },
      );
    const nextEmail = data.email.trim().toLowerCase();
    if (nextEmail === auth.user.email?.toLowerCase())
      return Response.json(
        { error: "Enter an email address different from your current one." },
        { status: 400 },
      );

    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verified, error: verificationError } =
      await verifier.auth.signInWithPassword({
        email: auth.user.email ?? "",
        password: data.currentPassword,
      });
    if (
      verificationError ||
      !verified.user ||
      verified.user.id !== auth.user.id
    )
      return Response.json(
        { error: "The current password is incorrect." },
        { status: 401 },
      );

    const updateResponse = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: nextEmail }),
    });
    const updateResult = (await updateResponse
      .json()
      .catch(() => null)) as { msg?: string; message?: string } | null;
    if (!updateResponse.ok)
      return Response.json(
        {
          error:
            updateResult?.msg ??
            updateResult?.message ??
            "Unable to request an email change.",
        },
        { status: updateResponse.status },
      );
    return Response.json({ ok: true });
  }

  if (data.action === "change" && !data.currentPassword)
    return Response.json(
      { error: "Enter your current password to continue." },
      { status: 400 },
    );

  if (data.action === "change" && !hasPasswordCredential)
    return Response.json(
      { error: "This account has no email password. Use Set Password instead." },
      { status: 409 },
    );

  if (data.action === "reset") {
    const { data: claims, error: claimsError } = await scoped.auth.getClaims(token);
    const methods = claims?.claims?.amr;
    const isRecoverySession =
      Array.isArray(methods) &&
      methods.some((method) =>
        typeof method === "string"
          ? method === "recovery"
          : method?.method === "recovery",
      );
    if (claimsError || !isRecoverySession)
      return Response.json(
        {
          error:
            "This password reset session is invalid or expired. Request a new reset link.",
        },
        { status: 403 },
      );
  }

  const updateError = await updateAuthenticatedUser(
    url,
    key,
    token,
    data.action === "change"
      ? { password: data.password!, current_password: data.currentPassword! }
      : { password: data.password! },
  );
  if (updateError)
    return Response.json({ error: updateError.message }, { status: updateError.status });
  return Response.json({ ok: true });
}
