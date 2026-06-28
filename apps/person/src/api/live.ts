import type {
  CreatePersonRequestInput,
  CustomerDetailPanelDto,
  SavePersonNoteInput,
  SavePersonTaskNoteInput,
  SchedulePersonTaskFollowUpInput,
} from '@factory-engine-pro/contracts';
import { apiErrorMessage, personApi } from '../lib/api';
import type { Card, ColumnId, CustomerRow, DailyOperations, TaskBriefDetail } from '../types';

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
export type EventSource = 'manual' | 'ai_transcript' | 'ai_segment' | 'ai_stale';
export type EventKind = 'call' | 'callback' | 'meeting' | 'reminder' | 'task';
export interface CalEvent {
  id: string;
  title: string;
  customer: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  dayIso: string;
  startHour: number;
  durationMinutes: number;
  kind: EventKind;
  source: EventSource;
  aiBrief?: {
    whyCalling: string;
    painPoints: string[];
    callGoal: string;
    promptKey: string;
    promptVersion: string;
    modelUsed: string;
    confidence: number;
    transcriptSnippet?: string;
    suggestedActions: string[];
  };
}
export interface NoteRow {
  id: string;
  kind: 'scratch' | 'queue';
  title: string;
  body: string;
  linkedCustomer?: string;
  linkedQueueId?: string;
  createdAt: string;
  updatedAt: string;
}
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
export const fetchDailyOperations = () => personApi.personDailyOperations() as Promise<DailyOperations>;
export const moveCard = (input: { id: string; columnId: ColumnId; index: number }) =>
  personApi.movePersonQueueCard(input.id, { columnId: input.columnId, index: input.index }) as Promise<Card>;
export const togglePin = (id: string) => personApi.togglePersonQueuePin(id, {}) as Promise<Card>;
export const toggleCustomerPin = (customerId: string) => personApi.togglePersonCustomerPin(customerId, {}) as Promise<{ ok: boolean; pinned: boolean }>;
export const fetchTaskBrief = (id: string) => personApi.personTaskBrief(id) as Promise<TaskBriefDetail>;
export const saveTaskNote = (id: string, input: SavePersonTaskNoteInput) => personApi.savePersonTaskNote(id, input) as Promise<TaskBriefDetail>;
export const scheduleTaskFollowUp = (id: string, input: SchedulePersonTaskFollowUpInput) =>
  personApi.schedulePersonTaskFollowUp(id, input) as Promise<TaskBriefDetail>;
export const fetchCustomers = () => personApi.personCustomers() as Promise<CustomerRow[]>;
export const fetchCustomerDetail = (customerId: string) => personApi.personCustomerDetail(customerId) as Promise<CustomerDetailPanelDto>;
export const fetchCalEvents = () => personApi.personCalendarEvents() as Promise<CalEvent[]>;
export const fetchTeammates = () => personApi.personTeammates() as Promise<Teammate[]>;
export const fetchThread = (id: string) => personApi.personThread(id) as Promise<ChatMessage[]>;
export const sendChatMessage = (input: { threadId: string; text: string }) =>
  personApi.sendPersonMessage(input) as Promise<ChatMessage>;
export const fetchNotes = () => personApi.personNotes() as Promise<NoteRow[]>;
export const saveNote = (input: SavePersonNoteInput) => personApi.savePersonNote(input) as Promise<NoteRow>;
export const fetchEmails = () => personApi.personEmails() as Promise<EmailRow[]>;
export const fetchAnnouncements = () => personApi.personAnnouncements() as Promise<Announcement[]>;
export const fetchNotifications = () => personApi.personNotifications() as Promise<NotificationRow[]>;
export const fetchTraining = () => personApi.personTraining() as Promise<TrainingResponse>;
export const fetchRequests = () => personApi.personRequests() as Promise<StaffRequestRow[]>;
export const createStaffRequest = (input: CreatePersonRequestInput) =>
  personApi.createPersonRequest(input) as Promise<StaffRequestRow[]>;
