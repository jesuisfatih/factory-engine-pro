import assert from 'node:assert/strict';
import test from 'node:test';
import { PersonWorkspaceService } from './person-workspace.service.js';

test('an accepted priority call creates one outcome-required staff work item', async () => {
  const createdWork: Array<Record<string, unknown>> = [];
  const recordedOutcome: Array<Record<string, unknown>> = [];
  const staffWork = {
    assertProactiveDialAllowed: async () => undefined,
    create: async (input: Record<string, unknown>) => {
      createdWork.push(input);
      return { id: 'swi_priority_call' };
    },
    recordOutcome: async (id: string, memberId: string, input: Record<string, unknown>) => {
      recordedOutcome.push({ id, memberId, ...input });
      return { id: 'swo_priority_call' };
    },
  };
  const service = new PersonWorkspaceService(
    {
      db: {
        customer: {
          findFirst: async () => ({
            id: 'cust_priority',
            companyName: 'Acme Prints',
            firstName: null,
            lastName: null,
            email: 'buyer@example.com',
          }),
        },
      },
    } as never,
    { require: () => ({ tenantId: 'ten_test' }) } as never,
    {} as never,
    { capturePhonePoints: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      dialForMember: async () => ({
        ok: true,
        mode: 'aircall_dial',
        phone: '+1 (312) 555-0100',
        normalizedPhone: '+13125550100',
        aircallUserId: 'air_user_1',
        message: 'Dial accepted.',
        telHref: 'tel:+13125550100',
        providerStatus: 202,
      }),
    } as never,
    {} as never,
    {} as never,
    staffWork as never,
    {} as never,
    { log: () => undefined } as never,
    { emitTenantInvalidate: () => undefined } as never,
    {} as never,
    {} as never,
    { recordDial: async () => ({ id: 'contact_dial_1' }) } as never,
  );
  const privateService = service as unknown as {
    currentMember: () => Promise<{ id: string }>;
    assertCustomerInWorkspace: () => Promise<void>;
  };
  privateService.currentMember = async () => ({ id: 'tmbr_staff' });
  privateService.assertCustomerInWorkspace = async () => undefined;

  const result = await service.dialCustomer({
    phone: '+1 (312) 555-0100',
    customerId: 'cust_priority',
    source: 'priority_board',
    idempotencyKey: 'priority-call-request-1',
  });

  assert.equal(result.staffWorkItemId, 'swi_priority_call');
  assert.equal(createdWork[0]?.source, 'priority_call');
  assert.equal(createdWork[0]?.assignedMemberId, 'tmbr_staff');
  assert.equal(createdWork[0]?.idempotencyKey, 'priority-dial:priority-call-request-1');
  assert.equal(recordedOutcome[0]?.id, 'swi_priority_call');
  assert.equal(recordedOutcome[0]?.memberId, 'tmbr_staff');
  assert.equal(recordedOutcome[0]?.disposition, 'not_selected');
  assert.equal(recordedOutcome[0]?.idempotencyKey, 'dial-outcome:priority-call-request-1');
});
