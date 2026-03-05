'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store: token -> skills profile
const store = new Map();

/**
 * Create a new shareable skills profile.
 * Body: { name: string, skills: Array<{ name: string, level: string, description?: string }> }
 * Returns: { token: string, shareUrl: string }
 */
app.post('/api/skills', (req, res) => {
  const { name, skills } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'A non-empty "name" is required.' });
  }

  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: '"skills" must be a non-empty array.' });
  }

  for (const skill of skills) {
    if (!skill.name || typeof skill.name !== 'string' || skill.name.trim() === '') {
      return res.status(400).json({ error: 'Each skill must have a non-empty "name".' });
    }
  }

  const token = uuidv4();
  const profile = {
    token,
    name: name.trim(),
    skills: skills.map((s) => ({
      name: s.name.trim(),
      level: (s.level || 'intermediate').trim(),
      description: s.description ? s.description.trim() : '',
    })),
    createdAt: new Date().toISOString(),
  };

  store.set(token, profile);

  return res.status(201).json({ token, shareUrl: `/share.html?token=${token}` });
});

/**
 * Retrieve a skills profile by token.
 */
app.get('/api/skills/:token', (req, res) => {
  const profile = store.get(req.params.token);
  if (!profile) {
    return res.status(404).json({ error: 'Skills profile not found.' });
  }
  return res.json(profile);
});

// Expose the store for testing
app.locals.store = store;

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`AI-skills server running on http://localhost:${PORT}`);
  });
}
