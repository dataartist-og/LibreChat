import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { LectureNote } from 'librechat-data-provider';
import Explorer from '../Explorer';
import seed from '../mcgrath.json';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
const source = seed.sources.find((item) => /features as rewards/i.test(item.title))!;
const moment = seed.moments.find((item) => item.start <= 2536 && item.end > 2536)!;
function Harness({ close }: { close: () => void }) {
  const [notes, setNotes] = useState<LectureNote[]>([]);
  return (
    <Explorer
      lecture={seed}
      timestamp={2536.78}
      momentId={moment.id}
      source={source}
      evidence={moment.evidence[0]}
      notes={notes}
      onClose={close}
      onSave={(note) => setNotes((previous) => [...previous, note])}
      onEdit={(id, takeaways) =>
        setNotes((previous) =>
          previous.map((note) => (note.id === id ? { ...note, takeaways } : note)),
        )
      }
      onRemove={(id) => setNotes((previous) => previous.filter((note) => note.id !== id))}
    />
  );
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  const close = jest.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <Harness close={close} />
    </QueryClientProvider>,
  );
  return { ...view, close };
}
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
  jest
    .spyOn(dataService, 'getLectureVoiceStatus')
    .mockResolvedValue({ provider: 'codex', available: false, reason: 'Unavailable in test' });
  jest.spyOn(dataService, 'getLectureSource').mockResolvedValue({
    title: source.title,
    url: source.url,
    html: '<article><h2 id="data">Data</h2><p>Paper text.</p></article>',
  });
});
it('opens the whole paper with no generated clutter, answers from the selected source, and lets notes be edited and removed', async () => {
  const ask = jest.spyOn(dataService, 'askLecture').mockResolvedValue({
    answer: 'The experiment compared **two controls**.',
    takeaways: ['Two controls were compared.'],
    citations: [{ sourceId: source.id, url: source.url, section: 'Experiment' }],
  });
  mount();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(await screen.findByTitle('com_ui_lecture_reader_frame')).toBeInTheDocument();
  expect(ask).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_ui_lecture_question' }), {
    target: { value: 'What were the controls?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_lecture_submit_question' }));
  await waitFor(() => expect(screen.getByText('two controls')).toBeInTheDocument());
  expect(ask).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: source.id,
      momentId: moment.id,
      question: 'What were the controls?',
    }),
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole('tab', { name: /com_ui_lecture_my_notes/ }));
  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByText('42:16')).toBeInTheDocument();
  expect(within(panel).getByText('Two controls were compared.')).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: 'com_ui_lecture_edit_takeaways' }));
  fireEvent.change(within(panel).getByRole('textbox'), {
    target: { value: 'My important takeaway' },
  });
  fireEvent.click(within(panel).getByRole('button', { name: 'com_ui_save' }));
  expect(within(panel).getByText('My important takeaway')).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: 'com_ui_lecture_remove_note' }));
  expect(screen.getByText('com_ui_lecture_notes_empty_title')).toBeInTheDocument();
});
it('restores a failed question and records no invented answer', async () => {
  jest.spyOn(dataService, 'askLecture').mockRejectedValue(new Error('unavailable'));
  mount();
  const input = screen.getByRole('textbox', { name: 'com_ui_lecture_question' });
  fireEvent.change(input, { target: { value: 'How much data?' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_lecture_submit_question' }));
  await waitFor(() => expect(input).toHaveValue('How much data?'));
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /com_ui_lecture_my_notes/ }));
  expect(screen.getByText('com_ui_lecture_notes_empty_title')).toBeInTheDocument();
});
it('cancels pending tutor work when the source explorer closes', async () => {
  const ask = jest.spyOn(dataService, 'askLecture').mockImplementation(
    (_payload, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
  );
  const view = mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_ui_lecture_question' }), {
    target: { value: 'Explain the experiment' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_lecture_submit_question' }));
  await waitFor(() => expect(ask).toHaveBeenCalled());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /com_ui_lecture_back/ }));
  });
  expect(ask.mock.calls[0][1]?.aborted).toBe(true);
  expect(view.close).toHaveBeenCalledTimes(1);
});
