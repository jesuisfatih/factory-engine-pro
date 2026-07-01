import type {
  CreatePersonRequestInput,
  CustomerDetailPanelDto,
  AircallDialInput,
  AircallDialResponse,
  PersonEmailContact,
  PersonNoteRow,
  PersonDailyOperationRange,
  PersonTaskSyncResult,
  ReplyPersonNoteInput,
  ArchivePersonDailyCallResult,
  ReorderPersonDailyCallInput,
  ReorderPersonDailyCallResult,
  SavePersonEmailDraftInput,
  SavePersonCustomerNoteInput,
  SavePersonNoteInput,
  SavePersonTaskNoteInput,
  SchedulePersonTaskFollowUpInput,
  SendPersonEmailInput,
  TransferPersonTaskInput,
} from '@factory-engine-pro/contracts';
import { apiErrorMessage, personApi } from '../lib/api';
import type { Card, ColumnId, CustomerRow, DailyOperations, TaskBrief, TaskBriefDetail, TransferTarget, TransferTaskResult } from '../types';

export type PresenceStatus = 'online' | 'busy' | 'away' | 'offline';
export interface PersonSummary {
  queue: number;
  customers: number;
  notifications: number;
  assigned: number;
  failedMail: number;
}
export interface Teammate {
  id: string;
  name: string;
  email: string;
  role: string;
  status: PresenceStatus;
  lastSeen: string;
  unread: number;
  preview: string;
  lastAt: string;
}
export interface ChatMessage {
  id: string;
  threadId: string;
  fromMe: boolean;
  author: string;
  text: string;
  at: string;
}
export type EventSource = 'manual' | 'call_analysis' | 'segment_priority' | 'stale_follow_up' | 'admin_transfer';
export type EventKind = 'call' | 'callback' | 'meeting' | 'reminder' | 'task';
export interface CalEvent {
  id: string;
  serviceRequestId: string | null;
  customerId: string | null;
  title: string;
  customer: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  dayIso: string;
  startHour: number;
  durationMinutes: number;
  kind: EventKind;
  source: EventSource;
  aiBrief?: TaskBrief;
}
export type NoteRow = PersonNoteRow;
export interface EmailRow {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  unread: boolean;
  at: string;
  status: string;
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  from: string;
  severity: 'info' | 'success' | 'warn' | 'critical';
  at: string;
  read: boolean;
}
export interface NotificationRow {
  id: string;
  kind: 'mention' | 'assigned' | 'sla' | 'pin' | 'system';
  title: string;
  body: string;
  at: string;
  read: boolean;
}
export interface TrainingCard {
  id: string;
  title: string;
  description: string;
  source: string;
  updatedAt: string;
}
export interface TrainingResponse {
  highPriorityCount: number;
  cards: TrainingCard[];
}
export interface StaffRequestRow {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function friendlyError(error: unknown) {
  return apiErrorMessage(error);
}

export const fetchSummary = () => personApi.personWorkspaceSummary() as Promise<PersonSummary>;
export const fetchCards = () => personApi.personQueueCards() as Promise<Card[]>;
export const fetchDailyOperations = (range: PersonDailyOperationRange = 'last7d') =>
  personApi.personDailyOperations(range) as Promise<DailyOperations>;
export const moveCard = (input: { id: string; columnId: ColumnId; index: number }) =>
  personApi.movePersonQueueCard(input.id, { columnId: input.columnId, index: input.index }) as Promise<Card>;
export const reorderDailyCalls = (input: ReorderPersonDailyCallInput) =>
  personApi.reorderPersonDailyCalls(input) as Promise<ReorderPersonDailyCallResult>;
export const archiveDailyCall = (id: string) =>
  personApi.archivePersonDailyCall(id) as Promise<ArchivePersonDailyCallResult>;
export const syncPersonTasks = () => personApi.syncPersonTasks() as Promise<PersonTaskSyncResult>;
export const dialAircall = (input: AircallDialInput) => personApi.dialPersonAircall(input) as Promise<AircallDialResponse>;
export const togglePin = (id: string) => personApi.togglePersonQueuePin(id, {}) as Promise<Card>;
export const toggleCustomerPin = (customerId: string) => personApi.togglePersonCustomerPin(customerId, {}) as Promise<{ ok: boolean; pinned: boolean }>;
export const fetchTransferTargets = () => personApi.personTransferTargets() as Promise<TransferTarget[]>;
export const transferTask = (id: string, input: TransferPersonTaskInput) =>
  personApi.transferPersonTask(id, input) as Promise<TransferTaskResult>;
export const fetchTaskBrief = (id: string) => personApi.personTaskBrief(id) as Promise<TaskBriefDetail>;
export const saveTaskNote = (id: string, input: SavePersonTaskNoteInput) => personApi.savePersonTaskNote(id, input) as Promise<TaskBriefDetail>;
export const scheduleTaskFollowUp = (id: string, input: SchedulePersonTaskFollowUpInput) =>
  personApi.schedulePersonTaskFollowUp(id, input) as Promise<TaskBriefDetail>;
export const fetchCustomers = () => personApi.personCustomers() as Promise<CustomerRow[]>;
export const fetchCustomerArchive = () => personApi.personCustomerArchive() as Promise<CustomerRow[]>;
export const fetchCustomerDetail = (customerId: string) => personApi.personCustomerDetail(customerId) as Promise<CustomerDetailPanelDto>;
export const fetchCustomerArchiveDetail = (customerId: string) => personApi.personCustomerArchiveDetail(customerId) as Promise<CustomerDetailPanelDto>;
export const saveCustomerNote = (customerId: string, input: SavePersonCustomerNoteInput) =>
  personApi.savePersonCustomerNote(customerId, input) as Promise<CustomerDetailPanelDto>;
export const fetchCalEvents = () => personApi.personCalendarEvents() as Promise<CalEvent[]>;
export const fetchTeammates = () => personApi.personTeammates() as Promise<Teammate[]>;
export const fetchThread = (id: string) => personApi.personThread(id) as Promise<ChatMessage[]>;
export const sendChatMessage = (input: { threadId: string; text: string }) =>
  personApi.sendPersonMessage(input) as Promise<ChatMessage>;
export const fetchNotes = () => personApi.personNotes() as Promise<NoteRow[]>;
export const saveNote = (input: SavePersonNoteInput) => personApi.savePersonNote(input) as Promise<NoteRow>;
export const replyNote = (id: string, input: ReplyPersonNoteInput) => personApi.replyPersonNote(id, input) as Promise<NoteRow>;
export const fetchEmails = () => personApi.personEmails() as Promise<EmailRow[]>;
export const fetchEmailContacts = () => personApi.personEmailContacts() as Promise<PersonEmailContact[]>;
export const saveEmailDraft = (input: SavePersonEmailDraftInput) => personApi.savePersonEmailDraft(input) as Promise<EmailRow>;
export const sendEmail = (input: SendPersonEmailInput) => personApi.sendPersonEmail(input) as Promise<EmailRow>;
export const fetchAnnouncements = () => personApi.personAnnouncements() as Promise<Announcement[]>;
export const fetchNotifications = () => personApi.personNotifications() as Promise<NotificationRow[]>;
export const fetchTraining = () => personApi.personTraining() as Promise<TrainingResponse>;
export const fetchRequests = () => personApi.personRequests() as Promise<StaffRequestRow[]>;
export const createStaffRequest = (input: CreatePersonRequestInput) =>
  personApi.createPersonRequest(input) as Promise<StaffRequestRow[]>;
