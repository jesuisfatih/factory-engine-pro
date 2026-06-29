import { BadRequestException, Injectable } from '@nestjs/common';
import {
  workflowActionSchema,
  workflowConditionSchema,
  workflowTriggerSchema,
  createTaskAxisSchema,
  assertCreateTaskAxisContract,
  type CreateTaskAxis,
  WORKFLOW_ACTIONS,
  WORKFLOW_CONDITIONS,
  WORKFLOW_TRIGGERS,
  type WorkflowAction,
  type WorkflowCondition,
  type WorkflowTrigger,
} from '@factory-engine-pro/contracts';

@Injectable()
export class WorkflowExecutorService {
  recognizeTrigger(value: string) {
    const trigger = workflowTriggerSchema.safeParse(value);
    if (!trigger.success) throw new BadRequestException(`Unknown workflow trigger: ${value}`);
    return this.describeTrigger(trigger.data);
  }

  recognizeCondition(value: string) {
    const condition = workflowConditionSchema.safeParse(value);
    if (!condition.success) throw new BadRequestException(`Unknown workflow condition: ${value}`);
    return this.describeCondition(condition.data);
  }

  recognizeAction(value: string) {
    const action = workflowActionSchema.safeParse(value);
    if (!action.success) throw new BadRequestException(`Unknown workflow action: ${value}`);
    return this.describeAction(action.data);
  }

  requireCreateTaskAxis(value: unknown): CreateTaskAxis {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'support') {
      throw new BadRequestException('Workflow create_task cannot target support. Create Support cases manually from the Support or staff task UI.');
    }
    const axis = createTaskAxisSchema.safeParse(raw);
    if (!axis.success) throw new BadRequestException(`Invalid create_task axis: ${String(value)}`);
    return assertCreateTaskAxisContract(axis.data);
  }

  recognizedCounts() {
    for (const trigger of WORKFLOW_TRIGGERS) this.describeTrigger(trigger);
    for (const condition of WORKFLOW_CONDITIONS) this.describeCondition(condition);
    for (const action of WORKFLOW_ACTIONS) this.describeAction(action);
    return {
      recognizedTriggers: WORKFLOW_TRIGGERS.length,
      recognizedConditions: WORKFLOW_CONDITIONS.length,
      recognizedActions: WORKFLOW_ACTIONS.length,
    };
  }

  private describeTrigger(trigger: WorkflowTrigger) {
    switch (trigger) {
      case 'aircall.call.created':
      case 'aircall.call.ended':
      case 'aircall.call.missed':
      case 'aircall.transcript.received':
      case 'shopify.order.created':
      case 'shopify.order.cancelled':
      case 'shopify.order.refunded':
      case 'shopify.customer.created':
      case 'shopify.customer.updated':
      case 'segment.member_added':
      case 'segment.member_removed':
      case 'b2b_access.request.created':
      case 'schedule.daily':
      case 'manual.trigger':
      case 'psych.tag.detected':
      case 'product.detected_in_transcript':
      case 'customer.matched_from_transcript':
      case 'call_intent.classified':
      case 'psych.analysis.completed':
      case 'customer.repeat_call.detected':
      case 'customer.first_call.detected':
      case 'customer.ltv.crossed_threshold':
      case 'customer.tagged_in_admin':
      case 'segment.weight_changed':
      case 'customer.order_created':
      case 'subuser.added':
      case 'task.completed':
      case 'task.overdue':
        return { trigger, accepted: true };
      default:
        return exhaustive(trigger);
    }
  }

  private describeCondition(condition: WorkflowCondition) {
    switch (condition) {
      case 'call_intent':
      case 'psych_tag_includes':
      case 'product_mentioned':
      case 'previous_purchase_includes':
      case 'segment_member':
      case 'call_count_in_window':
      case 'is_first_call':
      case 'customer_ltv_gte':
      case 'order_count_in_window':
      case 'last_order_age_lte':
      case 'open_task_exists_for_intent':
      case 'axis_primary_is':
      case 'time_of_day_in_range':
      case 'day_of_week':
        return { condition, accepted: true };
      default:
        return exhaustive(condition);
    }
  }

  private describeAction(action: WorkflowAction) {
    switch (action) {
      case 'create_task':
      case 'pin_customer':
      case 'add_note':
      case 'segment_add':
      case 'segment_remove':
      case 'route_member':
      case 'add_watcher':
      case 'escalate':
      case 'send_mail':
      case 'no-op':
        return { action, accepted: true };
      default:
        return exhaustive(action);
    }
  }
}

function exhaustive(value: never): never {
  throw new BadRequestException(`Unhandled workflow enum value: ${String(value)}`);
}
