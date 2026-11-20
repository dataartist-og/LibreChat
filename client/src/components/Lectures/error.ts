import { isAxiosError } from 'axios';

export function lectureError(error: unknown, fallback: string): string {
  if (isAxiosError<{ error?: string }>(error)) {
    const message = error.response?.data?.error;
    if (typeof message === 'string') {
      return message.slice(0, 1000);
    }
  }
  return fallback;
}
