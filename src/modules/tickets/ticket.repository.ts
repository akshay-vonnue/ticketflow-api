import type { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { AuthUser } from '../../types/auth.js';

const ticketInclude = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  },
  assignedTo: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  }
} satisfies Prisma.TicketInclude;

const commentInclude = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  },
  ticket: {
    select: {
      title: true,
      description: true
    }
  }
};

export type TicketWithRelations = Prisma.TicketGetPayload<{
  include: typeof ticketInclude;
}>;

type TicketFilters = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string;
  createdById?: string;
};

type PaginationInput = {
  page: number;
  limit: number;
};

export class TicketRepository {
  async create(data: Prisma.TicketUncheckedCreateInput) {
    return prisma.ticket.create({
      data,
      include: ticketInclude
    });
  }

  async findById(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      include: ticketInclude
    });
  }

  async findMany(filters: TicketFilters, pagination: PaginationInput) {
    const where: Prisma.TicketWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters.createdById ? { createdById: filters.createdById } : {})
    };

    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy: {
          createdAt: 'desc'
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit
      }),
      prisma.ticket.count({ where })
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: Prisma.TicketUncheckedUpdateInput,
    user?: AuthUser
  ) {
    const ticket = await prisma.ticket.findUnique({
      where: {
        id: id
      }
    });

    if (ticket && data.status && user) {
      return prisma.$transaction([
        prisma.ticket.update({
          where: { id },
          data,
          include: ticketInclude
        }),
        prisma.statusHistory.create({
          data: {
            ticketId: id,
            changedById: user?.userId,
            from: ticket.status,
            to: data.status as TicketStatus
          }
        })
      ]);
    }

    return prisma.ticket.update({
      where: { id },
      data,
      include: ticketInclude
    });
  }

  async delete(id: string) {
    return prisma.ticket.delete({
      where: { id },
      include: ticketInclude
    });
  }

  async findAssignableUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        name: true,
        email: true
      }
    });
  }

  async addTicketComment(data: Prisma.CommentUncheckedCreateInput) {
    return prisma.comment.create({
      data,
      include: commentInclude
    });
  }
}
