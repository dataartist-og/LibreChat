import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { LectureYouTubeResponse } from 'librechat-data-provider';
import Creator from '../Creator';
import seed from '../mcgrath.json';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
const imported: LectureYouTubeResponse = {
  title: 'A different lecture',
  videoUrl: 'https://youtu.be/abcdefghijk',
  description: 'Source: https://arxiv.org/abs/2602.10067',
  transcript: '[00:00] Let us discuss the experiment.\n[00:20] Here are the results.',
  transcriptKind: 'manual',
  language: 'en',
  sourceUrls: ['https://arxiv.org/abs/2602.10067'],
  warnings: [],
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onCreated = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <Creator onCreated={onCreated} onClose={jest.fn()} />
    </QueryClientProvider>,
  );
  return onCreated;
}
it('retrieves a new video from its URL and indexes the returned transcript and description', async () => {
  const fetchVideo = jest.spyOn(dataService, 'getLectureYouTube').mockResolvedValue(imported);
  const index = jest.spyOn(dataService, 'indexLecture').mockResolvedValue(seed);
  const onCreated = mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_ui_lecture_url' }), {
    target: { value: imported.videoUrl },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_lecture_fetch_video' }));
  await screen.findByText('A different lecture');
  expect(fetchVideo).toHaveBeenCalledWith({ videoUrl: imported.videoUrl });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_lecture_build' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(seed));
  expect(index).toHaveBeenCalledWith({
    title: imported.title,
    videoUrl: imported.videoUrl,
    transcript: imported.transcript,
    description: imported.description,
  });
});
it('retains metadata and opens the manual transcript editor when YouTube captions are unavailable', async () => {
  jest.spyOn(dataService, 'getLectureYouTube').mockResolvedValue({
    ...imported,
    transcript: '',
    transcriptKind: 'unavailable',
    language: '',
    warnings: ['Captions are rate limited.'],
  });
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_ui_lecture_url' }), {
    target: { value: imported.videoUrl },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_lecture_fetch_video' }));
  await screen.findByText('Captions are rate limited.');
  expect(screen.getByRole('textbox', { name: 'com_ui_lecture_title' })).toHaveValue(imported.title);
  expect(screen.getByRole('textbox', { name: 'com_ui_lecture_description' })).toHaveValue(
    imported.description,
  );
  expect(screen.getByRole('textbox', { name: 'com_ui_lecture_transcript' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'com_ui_lecture_build' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_ui_lecture_transcript' }), {
    target: { value: imported.transcript },
  });
  expect(screen.getByRole('button', { name: 'com_ui_lecture_build' })).toBeEnabled();
});
