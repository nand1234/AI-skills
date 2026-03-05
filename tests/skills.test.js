'use strict';

const request = require('supertest');
const app = require('../server');

beforeEach(() => {
  // Clear the in-memory store before each test
  app.locals.store.clear();
});

describe('POST /api/skills', () => {
  test('creates a profile and returns a token and shareUrl', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'Alice', skills: [{ name: 'Python', level: 'expert' }] });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('shareUrl');
    expect(res.body.shareUrl).toMatch(/\/share\.html\?token=/);
  });

  test('stores the profile so it can be retrieved', async () => {
    const create = await request(app)
      .post('/api/skills')
      .send({ name: 'Bob', skills: [{ name: 'Machine Learning', level: 'advanced' }] });

    const { token } = create.body;

    const get = await request(app).get(`/api/skills/${token}`);
    expect(get.status).toBe(200);
    expect(get.body.name).toBe('Bob');
    expect(get.body.skills).toHaveLength(1);
    expect(get.body.skills[0].name).toBe('Machine Learning');
    expect(get.body.skills[0].level).toBe('advanced');
  });

  test('trims whitespace from name and skill names', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: '  Carol  ', skills: [{ name: '  NLP  ', level: 'intermediate' }] });

    expect(res.status).toBe(201);
    const { token } = res.body;

    const get = await request(app).get(`/api/skills/${token}`);
    expect(get.body.name).toBe('Carol');
    expect(get.body.skills[0].name).toBe('NLP');
  });

  test('defaults missing skill level to "intermediate"', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'Dave', skills: [{ name: 'Deep Learning' }] });

    expect(res.status).toBe(201);
    const get = await request(app).get(`/api/skills/${res.body.token}`);
    expect(get.body.skills[0].level).toBe('intermediate');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ skills: [{ name: 'Python' }] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when name is blank', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: '   ', skills: [{ name: 'Python' }] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when skills array is missing', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'Eve' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when skills array is empty', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'Frank', skills: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when a skill has an empty name', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'Grace', skills: [{ name: '' }] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('supports multiple skills', async () => {
    const skills = [
      { name: 'Python', level: 'expert' },
      { name: 'TensorFlow', level: 'advanced' },
      { name: 'Prompt Engineering', level: 'intermediate' },
    ];

    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'Hana', skills });

    expect(res.status).toBe(201);
    const get = await request(app).get(`/api/skills/${res.body.token}`);
    expect(get.body.skills).toHaveLength(3);
  });
});

describe('GET /api/skills/:token', () => {
  test('returns 404 for an unknown token', async () => {
    const res = await request(app).get('/api/skills/nonexistent-token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('returns the full profile for a valid token', async () => {
    const create = await request(app)
      .post('/api/skills')
      .send({ name: 'Iris', skills: [{ name: 'RAG', level: 'expert', description: 'Retrieval-augmented generation' }] });

    const get = await request(app).get(`/api/skills/${create.body.token}`);
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject({
      name: 'Iris',
      token: create.body.token,
      skills: [{ name: 'RAG', level: 'expert', description: 'Retrieval-augmented generation' }],
    });
    expect(get.body).toHaveProperty('createdAt');
  });

  test('each profile gets a unique token', async () => {
    const res1 = await request(app)
      .post('/api/skills')
      .send({ name: 'User1', skills: [{ name: 'Python' }] });

    const res2 = await request(app)
      .post('/api/skills')
      .send({ name: 'User2', skills: [{ name: 'Go' }] });

    expect(res1.body.token).not.toBe(res2.body.token);
  });
});
