import { z } from 'zod';

export const aircallLinkUserSchema = z.object({
  memberId: z.string().trim().min(1),
});
export type AircallLinkUserInput = z.infer<typeof aircallLinkUserSchema>;

export interface AircallUserDto {
  id: string;
  aircallUserId: string;
  name: string;
  email: string | null;
  extension: string | null;
  availableStatus: string | null;
  linkedMember: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface AircallUsersResponse {
  users: AircallUserDto[];
  members: Array<{
    id: string;
    email: string;
    name: string;
    aircallUserId: string | null;
  }>;
  source: 'aircall_api';
}
