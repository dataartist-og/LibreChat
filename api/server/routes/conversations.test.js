const express = require('express');
const request = require('supertest');

const mockSuggestClarificationOptions = jest.fn();

jest.mock('@librechat/api', () => ({
  createClarification: jest.fn(),
  listClarifications: jest.fn(),
  suggestClarificationOptions: (...args) => mockSuggestClarificationOptions(...args),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => {
  req.user = { id: 'user-1' };
  next();
});

jest.mock('~/models', () => ({
  getConvo: jest.fn(),
  getMessages: jest.fn(),
  getMessage: jest.fn(),
  createClarification: jest.fn(),
  listClarifications: jest.fn(),
  getClarification: jest.fn(),
  updateClarification: jest.fn(),
  createMessageRevision: jest.fn(),
  listMessageRevisions: jest.fn(),
  saveMessage: jest.fn(),
  listProjectSources: jest.fn(),
  getFiles: jest.fn(),
}));

const conversationsRoute = require('./conversations');

describe('conversations route', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationsRoute);
  });

  it('returns model-generated clarification options', async () => {
    mockSuggestClarificationOptions.mockResolvedValue({
      contentProfile: 'conceptual',
      focusSummary: 'The highlighted term likely needs a local definition.',
      suggestions: [
        {
          label: 'Local meaning',
          proposedQuestion: 'What does entropy mean here?',
          understandingGain: 'It would clarify the exact local sense.',
          reasoning: 'The noun is the likely ambiguity point.',
        },
      ],
    });

    const response = await request(app)
      .post('/api/conversations/conversation-1/clarifications/options')
      .send({
        parentMessageId: 'message-1',
        anchorStart: 0,
        anchorEnd: 7,
        anchorText: 'Entropy',
        anchorContextBefore: '',
        anchorContextAfter: ' increases in isolated systems.',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        contentProfile: 'conceptual',
      }),
    );
    expect(mockSuggestClarificationOptions).toHaveBeenCalled();
  });
});
