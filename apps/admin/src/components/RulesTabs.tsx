import { Tabs } from './Tabs';

export function RulesTabs() {
  return (
    <Tabs
      tabs={[
        { to: '/rules', i18nKey: 'nav.rules', id: 'tab-rules-engine', exact: true },
        { to: '/rules/shadow-telemetry', i18nKey: 'nav.shadow_telemetry', id: 'tab-rules-shadow-telemetry' },
        { to: '/rules/stats', i18nKey: 'nav.rule_stats', id: 'tab-rules-stats' },
      ]}
    />
  );
}
