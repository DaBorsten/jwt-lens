import { List } from "@raycast/api";

export function PleaseCopy(props: { ready: boolean }) {
  return (
    <List isLoading={!props.ready}>
      <List.EmptyView icon={"jwt.png"} title="Copy a JWT to your clipboard" />
    </List>
  );
}
