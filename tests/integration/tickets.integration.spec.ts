import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../helpers/test-app.js';
import {
  disconnectTestDatabase,
  resetTestDatabase
} from '../helpers/test-db.js';

async function login(email: string, password: string) {
  const response = await api.post('/api/auth/login').send({ email, password });
  return response.body.data.token as string;
}

describe('ticket API', () => {
  let adminToken: string;
  let agentToken: string;
  let user1Token: string;
  let user2Token: string;
  let agentId: string;

  beforeAll(async () => {
    await resetTestDatabase();

    adminToken = await login('admin@example.com', 'Admin123!');
    agentToken = await login('agent@example.com', 'Agent123!');
    user1Token = await login('user1@example.com', 'User123!');
    user2Token = await login('user2@example.com', 'User234!');

    const usersResponse = await api
      .get('/api/users?role=AGENT')
      .set('Authorization', `Bearer ${adminToken}`);

    agentId = usersResponse.body.data[0].id as string;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a ticket', async () => {
    const response = await api
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        title: 'Account settings page crashes',
        description:
          'Updating notification preferences crashes the page every time.',
        priority: 'HIGH'
      });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe('Account settings page crashes');
    expect(response.body.data.createdBy.email).toBe('user1@example.com');
  });

  it('retrieves a ticket by id', async () => {
    const listResponse = await api
      .get('/api/tickets?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    const ticketId = listResponse.body.data[0].id as string;

    const response = await api
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(ticketId);
  });

  it('lists tickets with pagination', async () => {
    const response = await api
      .get('/api/tickets?page=1&limit=3')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(3);
    expect(response.body.pagination.total).toBeGreaterThanOrEqual(10);
  });

  it('lets a user update their own open ticket', async () => {
    const createResponse = await api
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        title: 'Settings export incomplete',
        description:
          'Several settings are missing from the exported configuration file.',
        priority: 'MEDIUM'
      });

    const response = await api
      .patch(`/api/tickets/${createResponse.body.data.id}`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        title: 'Settings export misses feature flags'
      });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe(
      'Settings export misses feature flags'
    );
  });

  it('prevents a user from viewing another users ticket', async () => {
    const response = await api
      .get('/api/tickets/payment-failed-during-checkout')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('lets an admin delete a ticket', async () => {
    const createResponse = await api
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Temporary cleanup ticket',
        description:
          'This ticket exists only to validate delete behavior in tests.',
        priority: 'LOW'
      });

    const response = await api
      .delete(`/api/tickets/${createResponse.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(createResponse.body.data.id);
  });

  it('rejects delete by non-admin users', async () => {
    const response = await api
      .delete('/api/tickets/unable-to-reset-password')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an assigned agent to change status with valid transitions', async () => {
    const response = await api
      .patch('/api/tickets/unable-to-reset-password/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(response.status).toBe(200);
    expect(response.body.data[0].status).toBe('IN_PROGRESS');
    expect(response.body.data[1].from).toBe('OPEN');
    expect(response.body.data[1].to).toBe('IN_PROGRESS');
  });

  it('rejects invalid status transitions', async () => {
    const response = await api
      .patch('/api/tickets/unable-to-reset-password/status')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'CLOSED' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('allows admins to assign tickets', async () => {
    const response = await api
      .patch('/api/tickets/email-notifications-not-arriving/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedToId: agentId });

    expect(response.status).toBe(200);
    expect(response.body.data.assignedTo.id).toBe(agentId);
  });

  it('prevents users from assigning tickets', async () => {
    const response = await api
      .patch('/api/tickets/cannot-update-profile/assign')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ assignedToId: agentId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects invalid validation input', async () => {
    const response = await api
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        title: 'No',
        description: 'short',
        priority: 'NOT_A_PRIORITY'
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid assignee ids', async () => {
    const response = await api
      .patch('/api/tickets/mobile-layout-broken/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedToId: 'missing-user-id' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('add comment to a ticket', async () => {
    const ticketResponse = await api
      .post('/api/tickets')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        title: 'Account settings page crashes',
        description:
          'Updating notification preferences crashes the page every time.',
        priority: 'HIGH'
      });

    console.log(ticketResponse.body.data);

    // expect(ticketResponse.body.data.title).toBe('Account settings page crashes');

    const _assignResponse = await api
      .patch(`/api/tickets/${ticketResponse.body.data.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assignedToId: agentId
      });

    // console.log(assignResponse.body.data)

    const statusResponse = await api
      .patch(`/api/tickets/${ticketResponse.body.data.id}/status`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        status: 'IN_PROGRESS'
      });

    // console.log(statusResponse.body)

    expect(statusResponse.body.data[0].title).toBe(
      'Account settings page crashes'
    );

    const commentResponse = await api
      .post(`/api/tickets/${ticketResponse.body.data.id}/`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        comment: 'this is a comment for the issue'
      });

    expect(commentResponse.body.data.comment).toBe(
      'this is a comment for the issue'
    );
  });
});
