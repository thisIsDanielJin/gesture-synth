import { thereminMode } from './theremin';
import { padSculptorMode } from './padSculptor';
import { sequencerMode } from './sequencer';
import { drumMachineMode } from './drumMachine';
import type { ModeDescriptor, ModeId } from './types';

export const ALL_MODES: ModeDescriptor[] = [
  thereminMode,
  padSculptorMode,
  sequencerMode,
  drumMachineMode,
];

export const MODES_BY_ID: Record<ModeId, ModeDescriptor> = {
  theremin: thereminMode,
  padSculptor: padSculptorMode,
  sequencer: sequencerMode,
  drumMachine: drumMachineMode,
};

export const DEFAULT_MODE_ID: ModeId = 'theremin';
