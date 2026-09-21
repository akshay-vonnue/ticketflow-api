import {
  Role,
  TicketStatus,
  type TicketPriority,
  type Prisma
} from '@prisma/client';
import type { AuthUser } from '../../types/auth.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError
} from '../../utils/errors.js';
import {
  TicketRepository,
  type TicketWithRelations
} from './ticket.repository.js';
import type {
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput
} from './ticket.schemas.js';

const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  IN_PROGRESS: [TicketStatus.RESOLVED, TicketStatus.OPEN],
  RESOLVED: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  CLOSED: [TicketStatus.OPEN]
};

export function isValidStatusTransition(
  currentStatus: TicketStatus,
  nextStatus: TicketStatus
) {
  return allowedTransitions[currentStatus].includes(nextStatus);
}

type ListTicketsInput = ListTicketsQuery & {
  createdById?: string | undefined;
};

const repository = new TicketRepository();

function canViewTicket(user: AuthUser, ticket: TicketWithRelations) {
  if (user.role === Role.ADMIN || user.role === Role.AGENT) {
    return true;
  }

  return ticket.createdById === user.userId;
}

function canUpdateTicket(user: AuthUser, ticket: TicketWithRelations) {
  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role === Role.AGENT) {
    return ticket.assignedToId === user.userId;
  }

  return (
    ticket.createdById === user.userId && ticket.status === TicketStatus.OPEN
  );
}

function canAssignTicket(user: AuthUser) {
  return user.role === Role.ADMIN || user.role === Role.AGENT;
}

function canAddComment(user: AuthUser) {
  return user.role === Role.ADMIN || user.role === Role.AGENT;
}

function canDeleteTicket(user: AuthUser) {
  return user.role === Role.ADMIN;
}

function canChangeStatus(user: AuthUser, ticket: TicketWithRelations) {
  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role === Role.AGENT) {
    return ticket.assignedToId === user.userId;
  }

  return false;
}

export class TicketService {
  async createTicket(currentUser: AuthUser, input: CreateTicketInput) {
    let assignedToId = input.assignedToId;

    if (assignedToId) {
      if (!canAssignTicket(currentUser)) {
        throw new ForbiddenError('You are not allowed to assign tickets');
      }

      const assignee = await repository.findAssignableUserById(assignedToId);
      if (
        !assignee ||
        (assignee.role !== Role.AGENT && assignee.role !== Role.ADMIN)
      ) {
        throw new BadRequestError(
          'INVALID_ASSIGNEE',
          'Assigned user must be an admin or agent'
        );
      }

      if (
        currentUser.role === Role.AGENT &&
        assignee.id !== currentUser.userId
      ) {
        throw new ForbiddenError(
          'Agents can only assign tickets to themselves'
        );
      }

      assignedToId = assignee.id;
    }

    return repository.create({
      title: input.title,
      description: input.description,
      priority: input.priority,
      createdById: currentUser.userId,
      assignedToId: assignedToId ?? null
    });
  }

  async listTickets(currentUser: AuthUser, input: ListTicketsInput) {
    const filters: Partial<{
      status: TicketStatus;
      priority: TicketPriority;
      assignedToId: string;
      createdById: string;
    }> = {};

    if (input.status) {
      filters.status = input.status;
    }

    if (input.priority) {
      filters.priority = input.priority;
    }

    if (currentUser.role === Role.USER) {
      filters.createdById = currentUser.userId;
    } else {
      if (input.assignedToId) {
        filters.assignedToId = input.assignedToId;
      }

      if (input.createdById) {
        filters.createdById = input.createdById;
      }
    }

    const { items, total } = await repository.findMany(filters, {
      page: input.page,
      limit: input.limit
    });

    return {
      data: items,
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit)
      }
    };
  }

  async getTicketById(currentUser: AuthUser, ticketId: string) {
    const ticket = await repository.findById(ticketId);

    if (!ticket) {
      throw new NotFoundError('TICKET_NOT_FOUND', 'Ticket not found');
    }

    if (!canViewTicket(currentUser, ticket)) {
      throw new ForbiddenError('You are not allowed to view this ticket');
    }

    return ticket;
  }

  async updateTicket(
    currentUser: AuthUser,
    ticketId: string,
    input: UpdateTicketInput
  ) {
    const ticket = await this.getTicketById(currentUser, ticketId);

    if (!canUpdateTicket(currentUser, ticket)) {
      throw new ForbiddenError('You are not allowed to update this ticket');
    }

    const updateData: Prisma.TicketUncheckedUpdateInput = {};

    if (input.title !== undefined) {
      updateData.title = input.title;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.priority !== undefined) {
      updateData.priority = input.priority;
    }

    return repository.update(ticketId, updateData);
  }

  async deleteTicket(currentUser: AuthUser, ticketId: string) {
    const ticket = await this.getTicketById(currentUser, ticketId);

    if (!canDeleteTicket(currentUser)) {
      throw new ForbiddenError('You are not allowed to delete this ticket');
    }

    return repository.delete(ticket.id);
  }

  async changeStatus(
    currentUser: AuthUser,
    ticketId: string,
    nextStatus: TicketStatus
  ) {
    const ticket = await this.getTicketById(currentUser, ticketId);

    if (!canChangeStatus(currentUser, ticket)) {
      throw new ForbiddenError('You are not allowed to change ticket status');
    }

    if (ticket.status === nextStatus) {
      throw new BadRequestError(
        'INVALID_STATUS_TRANSITION',
        'Ticket is already in that status'
      );
    }

    if (!isValidStatusTransition(ticket.status, nextStatus)) {
      throw new BadRequestError(
        'INVALID_STATUS_TRANSITION',
        `Cannot move ticket from ${ticket.status} to ${nextStatus}`
      );
    }

    return repository.update(ticketId, { status: nextStatus }, currentUser);
  }

  async assignTicket(
    currentUser: AuthUser,
    ticketId: string,
    assignedToId: string
  ) {
    const ticket = await this.getTicketById(currentUser, ticketId);

    if (!canAssignTicket(currentUser)) {
      throw new ForbiddenError('You are not allowed to assign tickets');
    }

    const assignee = await repository.findAssignableUserById(assignedToId);

    if (
      !assignee ||
      (assignee.role !== Role.ADMIN && assignee.role !== Role.AGENT)
    ) {
      throw new BadRequestError(
        'INVALID_ASSIGNEE',
        'Assigned user must be an admin or agent'
      );
    }

    if (currentUser.role === Role.AGENT && assignee.id !== currentUser.userId) {
      throw new ForbiddenError('Agents can only assign tickets to themselves');
    }

    return repository.update(ticket.id, { assignedToId: assignee.id });
  }

  async addComment(currentUser: AuthUser, ticketId: string, comment: string) {
    if (!canAddComment(currentUser)) {
      throw new ForbiddenError('You are not allowed to assign comments');
    }

    return repository.addTicketComment({
      ticketId: ticketId,
      comment: comment,
      commentedById: currentUser.userId
    });
  }
}
