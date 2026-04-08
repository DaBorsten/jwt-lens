import { Action, ActionPanel, Clipboard, Color, Detail, LaunchProps } from "@raycast/api";
import { useEffect, useState } from "react";
import * as jose from "jose";
import { ListFromObject } from "./utils/list-from-object";
import { extractJwt } from "./utils/extract-jwt";
import { jwtLogo } from "./constants";

const TIMESTAMP_CLAIMS = new Set(["iat", "exp", "nbf", "auth_time", "updated_at"]);

function formatTimestamp(value: number): string {
  return new Date(value * 1000).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "medium",
  });
}

function MetadataSection({ title, items }: { title: string; items: ReturnType<typeof ListFromObject> }) {
  return (
    <>
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title={title} text="" />
      {items.map((item) => {
        const isTimestamp = typeof item.value === "number" && TIMESTAMP_CLAIMS.has(item.key);

        if (isTimestamp) {
          return (
            <Detail.Metadata.TagList key={item.key} title={item.key}>
              <Detail.Metadata.TagList.Item text={String(item.value)} />
              <Detail.Metadata.TagList.Item text={formatTimestamp(item.value as number)} color={Color.Green} />
            </Detail.Metadata.TagList>
          );
        }

        return (
          <Detail.Metadata.TagList key={item.key} title={item.key}>
            <Detail.Metadata.TagList.Item text={String(item.value)} />
          </Detail.Metadata.TagList>
        );
      })}
    </>
  );
}

const JwtView = (props: LaunchProps<{ arguments: { token: string } }>) => {
  const [clipboardText, setClipboardText] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Clipboard.readText().then((text) => {
      setClipboardText(text);
      setReady(true);
    });
  }, []);

  const argToken = props.arguments.token?.trim();
  const raw = argToken || clipboardText?.trim() || "";
  const token = raw ? extractJwt(raw) : "";

  if (!ready) {
    return <Detail isLoading={true} />;
  }

  if (!token) {
    return (
      <Detail
        markdown={`<img alt="JWT Logo" width="70" src="${jwtLogo}" />\n\n# Decode JWT\n\nCopy a JWT to your clipboard or pass a JWT token as argument.`}
      />
    );
  }

  try {
    const header = jose.decodeProtectedHeader(token);
    const data = jose.decodeJwt(token);
    const headItems = ListFromObject(header);
    const dataItems = ListFromObject(data);

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
        <MetadataSection title="─── HEADER ───" items={headItems} />
        <MetadataSection title="─── PAYLOAD ───" items={dataItems} />
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
            </ActionPanel.Section>
            <ActionPanel.Section title="PAYLOAD: DATA">
              {dataItems.map((item) => (
                <Action.CopyToClipboard key={item.key} title={`Copy ${item.key} Value`} content={item.value} />
              ))}
            </ActionPanel.Section>
            <ActionPanel.Section title="HEADER: DATA">
              {headItems.map((item) => (
                <Action.CopyToClipboard key={item.key} title={`Copy ${item.key} Value`} content={item.value} />
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
            <Detail.Metadata.Label title="Status" text="Invalid" />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Token Length" text={`${token.length} chars`} />
            <Detail.Metadata.TagList title="Parts Detected">
              <Detail.Metadata.TagList.Item
                text={`${token.split(".").length} of 3`}
                color={token.split(".").length === 3 ? Color.Orange : Color.Red}
              />
            </Detail.Metadata.TagList>
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Token" content={token} />
            <Action.CopyToClipboard title="Copy Error Message" content={errorMessage} />
          </ActionPanel>
        }
      />
    );
  }
};

export default JwtView;
