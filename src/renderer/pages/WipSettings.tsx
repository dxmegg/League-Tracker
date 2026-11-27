import { RiotAccountsSection, useAccountSettings } from "../components/settings/accounts";
import { Section } from "../components/settings/parts";
import { SyncSections, useSyncSettings } from "../components/settings/sync";

export default function WipSettings() {
  const accounts = useAccountSettings();
  const sync = useSyncSettings();
  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <RiotAccountsSection settings={accounts} />
      <SyncSections settings={sync} wip />
      <Section title="Language">{null}</Section>
    </div>
  );
}
