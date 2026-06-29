import { Injectable } from '@nestjs/common';
import {
  buildTranscriptResolverPromptFromEnums,
  CALL_INTENTS,
  OPERATIONAL_INTENTS,
  PSYCH_TAGS,
  URGENCY_LEVELS,
  WORKFLOW_CONDITIONS,
  WORKFLOW_ENUM_VERSION,
} from '@factory-engine-pro/contracts';

@Injectable()
export class WorkflowPromptService {
  readonly promptKey = 'ai.transcript-resolver';

  buildTranscriptResolverPrompt() {
    return buildTranscriptResolverPromptFromEnums();
  }

  preview() {
    const prompt = this.buildTranscriptResolverPrompt();
    return {
      promptKey: this.promptKey,
      promptVersion: WORKFLOW_ENUM_VERSION,
      prompt,
      includesAllPsychTags: PSYCH_TAGS.every((value) => prompt.includes(value)),
      includesAllCallIntents: CALL_INTENTS.every((value) => prompt.includes(value)),
      includesAllOperationalIntents: OPERATIONAL_INTENTS.every((value) => prompt.includes(value)),
      includesAllUrgencyLevels: URGENCY_LEVELS.every((value) => prompt.includes(value)),
      includesAllConditions: WORKFLOW_CONDITIONS.every((value) => prompt.includes(value)),
    };
  }
}
