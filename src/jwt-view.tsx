import { Action, ActionPanel, Clipboard, Color, Detail, Icon, LaunchProps } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import * as jose from "jose";
import { additionalClaims, ListFromObject } from "./utils/list-from-object";
import { extractJwt } from "./utils/extract-jwt";
import { jwtLogo } from "./constants";
import { formatDuration, formatRelative, getTimestampColor, getTokenStatus, isTimestamp } from "./utils/token-status";
import { VerifySignatureForm } from "./components/verify-signature-form";

const SCOPE_CLAIMS = new Set(["scope", "scp"]);
const ALG_FAMILIES: Record<string, string> = { HS: "HMAC", RS: "RSA", PS: "RSA-PSS", ES: "ECDSA" };
const MAX_TITLE_HINT_LENGTH = 30;

type Items = ReturnType<typeof ListFromObject>;

function formatTimestamp(value: number): string {
  return new Date(value * 1000).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "medium",
  });
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function claimTitle(key: string): string {
  // "Expiration time (seconds since Unix epoch)" -> "Expiration time"
  const hint = additionalClaims[key]?.split(" (")[0];
  return hint && hint.length <= MAX_TITLE_HINT_LENGTH ? `${key} · ${hint}` : key;
}

function claimTags(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(toText) : ["[]"];
  }
  if (typeof value === "string" && SCOPE_CLAIMS.has(key)) {
    const scopes = value.split(" ").filter(Boolean);
    return scopes.length > 0 ? scopes : [value];
  }
  return [toText(value)];
}

function describeAlg(alg: string): string | undefined {
  const match = /^(HS|RS|PS|ES)(\d{3})$/.exec(alg);
  return match ? `${ALG_FAMILIES[match[1]]} · SHA-${match[2]}` : undefined;
}

function MetadataSection({ title, items, now }: { title: string; items: Items; now: number }) {
  return (
    <>
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title={title} text="" />
      {items.map((item) => {
        const value: unknown = item.value;

        if (isTimestamp(item.key, value)) {
          const color = getTimestampColor(item.key, value, now);
          return (
            <Detail.Metadata.TagList key={item.key} title={claimTitle(item.key)}>
              <Detail.Metadata.TagList.Item text={String(value)} />
              <Detail.Metadata.TagList.Item text={formatTimestamp(value)} color={color} />
              <Detail.Metadata.TagList.Item text={formatRelative(value, now)} color={color} />
            </Detail.Metadata.TagList>
          );
        }

        if (item.key === "alg" && typeof value === "string") {
          const unsigned = value.toLowerCase() === "none";
          const description = unsigned ? "Unsigned" : describeAlg(value);
          return (
            <Detail.Metadata.TagList key={item.key} title={claimTitle(item.key)}>
              <Detail.Metadata.TagList.Item text={value} color={unsigned ? Color.Red : undefined} />
              {description && (
                <Detail.Metadata.TagList.Item text={description} color={unsigned ? Color.Red : Color.Purple} />
              )}
            </Detail.Metadata.TagList>
          );
        }

        return (
          <Detail.Metadata.TagList key={item.key} title={claimTitle(item.key)}>
            {claimTags(item.key, value).map((tag, index) => (
              <Detail.Metadata.TagList.Item key={index} text={tag} />
            ))}
          </Detail.Metadata.TagList>
        );
      })}
    </>
  );
}

const JwtView = (props: LaunchProps<{ arguments: { token: string } }>) => {
  const [clipboardText, setClipboardText] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  const readClipboard = useCallback(() => {
    Clipboard.readText().then((text) => {
      setClipboardText(text);
      setReady(true);
    });
  }, []);

  useEffect(readClipboard, [readClipboard]);

  const argToken = props.arguments.token?.trim();
  const raw = argToken || clipboardText?.trim() || "";
  const token = raw ? extractJwt(raw) : "";

  const reloadAction = !argToken && (
    <Action icon={Icon.ArrowClockwise} title="Reload from Clipboard" onAction={readClipboard} />
  );

  if (!ready) {
    return <Detail isLoading={true} />;
  }

  if (!token) {
    return (
      <Detail
        markdown={`<img alt="JWT Logo" width="70" src="${jwtLogo}" />\n\n# Decode JWT\n\nCopy a JWT to your clipboard or pass a JWT token as argument.`}
        actions={reloadAction ? <ActionPanel>{reloadAction}</ActionPanel> : undefined}
      />
    );
  }

  try {
    const header = jose.decodeProtectedHeader(token);
    const data = jose.decodeJwt(token);
    const headItems = ListFromObject(header);
    const dataItems = ListFromObject(data);
    const now = Math.floor(Date.now() / 1000);
    const status = getTokenStatus(data, now);
    const signature = token.split(".")[2] ?? "";
    const alg = typeof header.alg === "string" ? header.alg : "";
    const canVerify = Boolean(alg) && alg.toLowerCase() !== "none" && Boolean(signature);
    const timestampItems = dataItems.filter((item) => isTimestamp(item.key, item.value));
    const lifetime = isTimestamp("exp", data.exp) && isTimestamp("iat", data.iat) ? data.exp - data.iat : undefined;

    const markdownContent = [
      `## HEADER: ALGORITHM & TOKEN TYPE`,
      "```json",
      JSON.stringify(header, null, 2),
      "```",
      `## PAYLOAD: DATA`,
      "```json",
      JSON.stringify(data, null, 2),
      "```",
    ].join("\n");

    const metadata = (
      <Detail.Metadata>
        {/* Raycast renders the first metadata row flush with the top edge; an empty label adds the spacing */}
        <Detail.Metadata.Label title="" />
        <Detail.Metadata.TagList title="Status">
          <Detail.Metadata.TagList.Item text={status.label} color={status.color} />
          {status.detail && <Detail.Metadata.TagList.Item text={status.detail} color={status.color} />}
        </Detail.Metadata.TagList>
        {lifetime !== undefined && lifetime > 0 && (
          <Detail.Metadata.Label title="Lifetime" text={formatDuration(lifetime)} />
        )}
        <MetadataSection title="─── HEADER ───" items={headItems} now={now} />
        <MetadataSection title="─── PAYLOAD ───" items={dataItems} now={now} />
        <Detail.Metadata.Label title="" />
      </Detail.Metadata>
    );

    return (
      <Detail
        markdown={markdownContent}
        metadata={metadata}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action.CopyToClipboard title="Copy PAYLOAD JSON" content={JSON.stringify(data, null, 2)} />
              <Action.CopyToClipboard title="Copy HEADER JSON" content={JSON.stringify(header, null, 2)} />
              {canVerify && (
                <Action.Push
                  icon={Icon.Shield}
                  title="Verify Signature"
                  target={<VerifySignatureForm token={token} alg={alg} issuer={data.iss} />}
                />
              )}
              {reloadAction}
            </ActionPanel.Section>
            <ActionPanel.Section title="TOKEN">
              <Action.CopyToClipboard title="Copy Token" content={token} />
              {signature && <Action.CopyToClipboard title="Copy Signature" content={signature} />}
            </ActionPanel.Section>
            <ActionPanel.Section title="PAYLOAD: DATA">
              {dataItems.map((item) => (
                <Action.CopyToClipboard key={item.key} title={`Copy ${item.key} Value`} content={toText(item.value)} />
              ))}
              {timestampItems.map((item) => (
                <Action.CopyToClipboard
                  key={`${item.key}-iso`}
                  icon={Icon.Clock}
                  title={`Copy ${item.key} as ISO Date`}
                  content={new Date((item.value as number) * 1000).toISOString()}
                />
              ))}
            </ActionPanel.Section>
            <ActionPanel.Section title="HEADER: DATA">
              {headItems.map((item) => (
                <Action.CopyToClipboard key={item.key} title={`Copy ${item.key} Value`} content={toText(item.value)} />
              ))}
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const truncated = token.length > 60 ? token.substring(0, 60) + "…" : token;

    const errorMarkdown = [
      `# ⚠️ Invalid JWT Token`,
      ``,
      `The provided token could not be decoded.`,
      ``,
      `---`,
      ``,
      `### Error`,
      ``,
      `> ${errorMessage}`,
      ``,
      `### Token Preview`,
      ``,
      "```",
      truncated,
      "```",
      ``,
      `---`,
      ``,
      `*Make sure the token has three base64url-encoded parts separated by dots.*`,
    ].join("\n");

    return (
      <Detail
        markdown={errorMarkdown}
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.Label title="" />
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Invalid" color={Color.Red} />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Token Length" text={`${token.length} chars`} />
            <Detail.Metadata.TagList title="Parts Detected">
              <Detail.Metadata.TagList.Item
                text={`${token.split(".").length} of 3`}
                color={token.split(".").length === 3 ? Color.Orange : Color.Red}
              />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Label title="" />
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Token" content={token} />
            <Action.CopyToClipboard title="Copy Error Message" content={errorMessage} />
            {reloadAction}
          </ActionPanel>
        }
      />
    );
  }
};

export default JwtView;
