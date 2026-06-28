import { Injectable } from '@nestjs/common';
import {
  WORKFLOW_ENUM_CATALOG,
  WORKFLOW_ENUM_COUNTS,
  WORKFLOW_ENUM_VERSION,
  workflowEnumProbeValues,
  type WorkflowEnumCatalogResponse,
  type WorkflowEnumChainProbeResponse,
} from '@factory-engine-pro/contracts';
import { AppLogger } from '../../shared/logger.service.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Injectable()
export class RulesService {
  constructor(
    private readonly executor: WorkflowExecutorService,
    private readonly prompt: WorkflowPromptService,
    private readonly logger: AppLogger,
  ) {}

  catalog(): WorkflowEnumCatalogResponse {
    return {
      version: WORKFLOW_ENUM_CATALOG.version,
      generatedAt: new Date().toISOString(),
      psychTags: [...WORKFLOW_ENUM_CATALOG.psychTags],
      callIntents: [...WORKFLOW_ENUM_CATALOG.callIntents],
      urgencyLevels: [...WORKFLOW_ENUM_CATALOG.urgencyLevels],
      triggers: [...WORKFLOW_ENUM_CATALOG.triggers],
      triggerGroups: Object.fromEntries(
        Object.entries(WORKFLOW_ENUM_CATALOG.triggerGroups).map(([family, values]) => [family, [...values]]),
      ),
      conditions: [...WORKFLOW_ENUM_CATALOG.conditions],
      actions: [...WORKFLOW_ENUM_CATALOG.actions],
      counts: { ...WORKFLOW_ENUM_CATALOG.counts },
    };
  }

  enumChainProbe(): WorkflowEnumChainProbeResponse {
    const probeValues = workflowEnumProbeValues();
    const prompt = this.prompt.preview();
    const executorCounts = this.executor.recognizedCounts();

    this.executor.recognizeTrigger(probeValues.trigger);
    this.executor.recognizeCondition(probeValues.condition);
    this.executor.recognizeAction(probeValues.action);

    const response: WorkflowEnumChainProbeResponse = {
      ok: prompt.includesAllPsychTags
        && prompt.includesAllCallIntents
        && prompt.includesAllUrgencyLevels
        && prompt.includesAllConditions,
      version: WORKFLOW_ENUM_VERSION,
      checkedAt: new Date().toISOString(),
      counts: WORKFLOW_ENUM_COUNTS,
      prompt: {
        promptKey: prompt.promptKey,
        promptVersion: prompt.promptVersion,
        includesAllPsychTags: prompt.includesAllPsychTags,
        includesAllCallIntents: prompt.includesAllCallIntents,
        includesAllUrgencyLevels: prompt.includesAllUrgencyLevels,
        includesAllConditions: prompt.includesAllConditions,
      },
      canvas: {
        source: 'GET /api/v1/rules/catalog',
        triggerOptions: WORKFLOW_ENUM_COUNTS.triggers,
        conditionOptions: WORKFLOW_ENUM_COUNTS.conditions,
        actionOptions: WORKFLOW_ENUM_COUNTS.actions,
      },
      executor: executorCounts,
      probeValues,
    };

    this.logger.log('rules', 'enum_chain_verified', 'Workflow enum chain verified', {
      catalog_version: response.version,
      counts: response.counts,
      prompt_key: response.prompt.promptKey,
      probe_values: response.probeValues,
      executor: response.executor,
    });

    return response;
  }
}
