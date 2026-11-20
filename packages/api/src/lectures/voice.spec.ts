import { ownsVoiceSession, startLectureVoice, stopLectureVoice } from './voice';

describe('lecture voice boundaries', () => {
  it('only grants session ownership to its authenticated user', () => {
    expect(ownsVoiceSession({ userId: 'learner-a' }, 'learner-a')).toBe(true);
    expect(ownsVoiceSession({ userId: 'learner-a' }, 'learner-b')).toBe(false);
    expect(ownsVoiceSession(undefined, 'learner-a')).toBe(false);
  });

  it('rejects invalid bootstrap input before accessing a source or model', async () => {
    await expect(startLectureVoice({ sdp: 'not an SDP' }, 'learner-a')).rejects.toThrow();
  });

  it('passes only source-context fields to the strict grounding validator', async () => {
    await expect(
      startLectureVoice(
        {
          lecture: {
            id: 'test',
            title: 'Test',
            videoId: '_egu7OFem-k',
            description: '',
            duration: 10,
            sources: [{ id: 'paper', title: 'Paper', url: 'https://example.com/paper' }],
            moments: [
              {
                id: 'moment',
                start: 0,
                end: 10,
                title: 'Moment',
                explanation: '',
                technical: '',
                question: '',
                checkpoint: false,
                evidence: [],
              },
            ],
          },
          momentId: 'moment',
          sourceId: 'missing',
          sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' + 'a=sendrecv\r\n'.repeat(8),
        },
        'learner-a',
      ),
    ).rejects.toThrow('The selected source is not part of this lecture.');
  });

  it('makes stopping an already-ended session idempotent', async () => {
    await expect(
      stopLectureVoice({ sessionId: '11111111-1111-4111-8111-111111111111' }, 'learner-a'),
    ).resolves.toEqual({ stopped: true });
    await expect(stopLectureVoice({ sessionId: '../escape' }, 'learner-a')).rejects.toThrow();
  });
});
