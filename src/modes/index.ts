import { thereminMode } from './theremin';
import { padSculptorMode } from './padSculptor';
import type { ModeDescriptor, ModeId } from './types';

export const ALL_MODES: ModeDescriptor[] = [thereminMode, padSculptorMode];

export const MODES_BY_ID: Record<ModeId, ModeDescriptor> = {
  theremin: thereminMode,
  padSculptor: padSculptorMode,
};

export const DEFAULT_MODE_ID: ModeId = 'theremin';
