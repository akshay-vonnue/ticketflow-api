import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../types/auth.js';
import type {
  AddTicketCommentInput,
  AssignTicketInput,
  ChangeTicketStatusInput,
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput
} from './ticket.schemas.js';
import { TicketService } from './ticket.service.js';

const ticketService = new TicketService();

function authUser(request: Request) {
  return (request as AuthenticatedRequest).user!;
}

export class TicketController {
  async create(request: Request, response: Response) {
    const ticket = await ticketService.createTicket(
      authUser(request),
      request.body as CreateTicketInput
    );
    response.status(201).json({ data: ticket });
  }

  async list(request: Request, response: Response) {
    const result = await ticketService.listTickets(
      authUser(request),
      request.query as unknown as ListTicketsQuery
    );
    response.json(result);
  }

  async getById(request: Request, response: Response) {
    const ticket = await ticketService.getTicketById(
      authUser(request),
      String(request.params.id)
    );
    response.json({ data: ticket });
  }

  async update(request: Request, response: Response) {
    const ticket = await ticketService.updateTicket(
      authUser(request),
      String(request.params.id),
      request.body as UpdateTicketInput
    );
    response.json({ data: ticket });
  }

  async delete(request: Request, response: Response) {
    const ticket = await ticketService.deleteTicket(
      authUser(request),
      String(request.params.id)
    );
    response.json({ data: ticket });
  }

  async changeStatus(request: Request, response: Response) {
    const ticket = await ticketService.changeStatus(
      authUser(request),
      String(request.params.id),
      (request.body as ChangeTicketStatusInput).status
    );
    response.json({ data: ticket });
  }

  async assign(request: Request, response: Response) {
    const ticket = await ticketService.assignTicket(
      authUser(request),
      String(request.params.id),
      (request.body as AssignTicketInput).assignedToId
    );
    response.json({ data: ticket });
  }

  async add(request: Request, response: Response) {
    const comment = await ticketService.addComment(
      authUser(request),
      String(request.params.id),
      (request.body as AddTicketCommentInput).comment
    );

    response.json({ data: comment });
  }
}

export const ticketController = new TicketController();
