import { Action, ActionPanel, Form, Icon, Toast, showToast } from "@raycast/api";
import * as jose from "jose";

interface VerifySignatureFormProps {
  token: string;
  alg: string;
  issuer?: unknown;
}

interface FormValues {
  key: string;
  base64?: boolean;
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }
  return (await response.json()) as jose.JSONWebKeySet & { jwks_uri?: unknown };
}

async function resolveKey(input: string, alg: string, base64: boolean) {
  if (alg.startsWith("HS")) {
    return base64 ? new Uint8Array(Buffer.from(input, "base64")) : new TextEncoder().encode(input);
  }
  if (/^https?:\/\//i.test(input)) {
    const json = await fetchJson(input);
    // OpenID discovery documents point to the actual key set
    const jwks = typeof json.jwks_uri === "string" ? await fetchJson(json.jwks_uri) : json;
    return jose.createLocalJWKSet(jwks);
  }
  if (input.startsWith("{")) {
    const jwk = JSON.parse(input);
    return Array.isArray(jwk.keys) ? jose.createLocalJWKSet(jwk) : jose.importJWK(jwk, alg);
  }
  if (input.includes("BEGIN CERTIFICATE")) {
    return jose.importX509(input, alg);
  }
  return jose.importSPKI(input, alg);
}

export function VerifySignatureForm({ token, alg, issuer }: VerifySignatureFormProps) {
  const isHmac = alg.startsWith("HS");
  const discoveryUrl =
    typeof issuer === "string" && /^https:\/\//i.test(issuer)
      ? `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`
      : undefined;

  async function handleSubmit(values: FormValues) {
    const input = values.key.trim();
    if (!input) {
      await showToast({ style: Toast.Style.Failure, title: isHmac ? "Enter a secret" : "Enter a key" });
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "Verifying signature…" });
    try {
      const key = await resolveKey(isHmac ? values.key : input, alg, Boolean(values.base64));
      if (typeof key === "function") {
        await jose.compactVerify(token, key);
      } else {
        await jose.compactVerify(token, key);
      }
      toast.style = Toast.Style.Success;
      toast.title = "Signature verified";
      toast.message = undefined;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      if (e instanceof jose.errors.JWSSignatureVerificationFailed) {
        toast.title = "Signature invalid";
        toast.message = isHmac ? "The secret does not match this token" : "The key does not match this token";
      } else {
        toast.title = "Could not verify signature";
        toast.message = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return (
    <Form
      navigationTitle="Verify Signature"
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Shield} title="Verify Signature" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Algorithm" text={alg} />
      {isHmac ? (
        <>
          <Form.PasswordField id="key" title="Secret" placeholder="Shared secret used to sign the token" />
          <Form.Checkbox id="base64" label="Secret is Base64 encoded" defaultValue={false} />
        </>
      ) : (
        <Form.TextArea
          id="key"
          title="Public Key"
          placeholder="PEM public key, X.509 certificate, JWK / JWKS JSON, or a JWKS / OpenID discovery URL"
          defaultValue={discoveryUrl}
          info="Only the key set is fetched from a URL. The token itself is verified locally and never sent anywhere."
        />
      )}
      <Form.Description text="Checks the signature only. Expiration and other claims are shown in the decoded view." />
    </Form>
  );
}
