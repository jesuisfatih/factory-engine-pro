import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Wallet, Phone, BarChart3, Zap } from 'lucide-react';
import { fetchAiBudget } from '@/lib/mock';

function BudgetView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: budget } = useQuery({ queryKey: ['ai', 'budget'], queryFn: fetchAiBudget });

  if (!budget) return null;
  const alertX = (budget.alertThresholdPct / 100) * 100;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button id="btn-ai-budget-refresh" type="button" className="btn ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['ai', 'budget'] })}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="budget-card" id="budget-spend">
        <div className="row">
          <div>
            <h3>
              <Wallet size={14} style={{ color: '#7c3aed' }} />
              <span data-i18n-key="ai.budget.spend_card_title">{t('ai.budget.spend_card_title')}</span>
            </h3>
            <div className="spend">${budget.spend.toFixed(2)}</div>
            <div className="meta">
              <span data-i18n-key="ai.budget.cap_label">{t('ai.budget.cap_label')}</span> ${budget.cap.toFixed(2)} ·
              <span data-i18n-key="ai.budget.remaining_label"> {t('ai.budget.remaining_label')}</span> ${budget.remaining.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: 11 }}>
              <span data-i18n-key="ai.budget.reset_label">{t('ai.budget.reset_label')}</span> {budget.resetAt}
            </div>
            <div className="pct">{budget.pct}%</div>
          </div>
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${budget.pct}%` }} />
          <div className="alert-marker" style={{ left: `${alertX}%` }} />
        </div>
        <div className="bar-foot">
          <span>$0</span>
          <span className="alert-label" style={{ marginLeft: 'auto', marginRight: 4 }}>↑ alert ({budget.alertThresholdPct}%)</span>
          <span>${budget.cap.toFixed(2)}</span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card" id="budget-call-count">
          <div className="icon-wrap"><Phone size={16} /></div>
          <div>
            <div className="lbl" data-i18n-key="ai.budget.call_count">{t('ai.budget.call_count')}</div>
            <div className="v">{budget.callCount.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card" id="budget-tokens-in">
          <div className="icon-wrap"><BarChart3 size={16} /></div>
          <div>
            <div className="lbl" data-i18n-key="ai.budget.tokens_in">{t('ai.budget.tokens_in')}</div>
            <div className="v">{budget.tokensIn.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card" id="budget-tokens-out">
          <div className="icon-wrap"><BarChart3 size={16} /></div>
          <div>
            <div className="lbl" data-i18n-key="ai.budget.tokens_out">{t('ai.budget.tokens_out')}</div>
            <div className="v">{budget.tokensOut.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card" id="budget-test-send">
          <div className="icon-wrap"><Zap size={16} /></div>
          <div>
            <div className="lbl" data-i18n-key="ai.budget.test_send">{t('ai.budget.test_send')}</div>
            <div className="v">${budget.testSendSpent.toFixed(2)} / ${budget.testSendCap.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="budget-card" id="budget-settings">
        <h3 data-i18n-key="ai.budget.settings_title">{t('ai.budget.settings_title')}</h3>
        <div className="budget-settings-row">
          <span className="lbl" data-i18n-key="ai.budget.monthly_cap">{t('ai.budget.monthly_cap')}</span>
          <span className="val">${budget.cap.toFixed(2)}</span>
        </div>
        <div className="budget-settings-row">
          <span className="lbl" data-i18n-key="ai.budget.alert_threshold">{t('ai.budget.alert_threshold')}</span>
          <span className="val">{budget.alertThresholdPct}%</span>
        </div>
        <div className="budget-settings-row">
          <span className="lbl" data-i18n-key="ai.budget.stop_at_cap">{t('ai.budget.stop_at_cap')}</span>
          <span className="val" data-i18n-key="ai.budget.warn_only">{t('ai.budget.warn_only')}</span>
        </div>
        <div className="budget-settings-row">
          <span className="lbl" data-i18n-key="ai.budget.test_send_sub_limit">{t('ai.budget.test_send_sub_limit')}</span>
          <span className="val">{budget.testSendSubLimitPct}% <span className="muted" data-i18n-key="ai.budget.of_cap">{t('ai.budget.of_cap')}</span></span>
        </div>
        <div className="budget-readonly-note" data-i18n-key="ai.budget.readonly_note">
          {t('ai.budget.readonly_note')}
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/ai/budget')({ component: BudgetView });
