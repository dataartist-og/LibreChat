import { atom } from 'recoil';
import { atomWithLocalStorage } from './utils';

const activeProjectId = atomWithLocalStorage<string | null>('activeProjectId', null);

const projectSourcesOpen = atom<boolean>({
  key: 'projectSourcesOpen',
  default: false,
});

export default {
  activeProjectId,
  projectSourcesOpen,
};
