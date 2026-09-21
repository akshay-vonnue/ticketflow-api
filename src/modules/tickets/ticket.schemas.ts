import { TicketPriority, TicketStatus } from '@prisma/client';
import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export const createTicketSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
  assignedToId: z.string().min(1).optional()
});

export const ticketIdParamSchema = z.object({
  id: z.string().min(1)
});

export const listTicketsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assignedToId: z.string().min(1).optional(),
  createdById: z.string().min(1).optional()
});

export const updateTicketSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(10).max(5000).optional(),
    priority: z.nativeEnum(TicketPriority).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided'
  });

export const changeTicketStatusSchema = z.object({
  status: z.nativeEnum(TicketStatus)
});

export const assignTicketSchema = z.object({
  assignedToId: z.string().min(1)
});

export const addTicketCommentSchema = z.object({
  comment: z.string().trim().min(1).max(120)
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export type AddTicketCommentInput = z.infer<typeof addTicketCommentSchema>;
